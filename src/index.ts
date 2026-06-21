import { ConfigManager } from './config';
import { createLLMProvider } from './llm';
import { SecurityFilter } from './security';
import { CacheManager } from './cache';
import { OutputFormatter } from './output';
import { markErrorAsDisplayed } from './errors';
import { getShellCaptureStatus, isShellIntegrationConfigured, SessionError, SessionStore } from './session';
import { AnalysisRequest, AnalysisResponse, Config, SanitizedSessionBundle } from './types';
import { CredentialError, CredentialResolver, CredentialResolverLike, credentialErrorMessage } from './credentials';

interface MainOptions {
  cacheEnabled?: boolean;
  confirmBeforeSend?: boolean;
  verbose?: boolean;
}

interface MainDependencies {
  configManager?: Pick<ConfigManager, 'load' | 'validate'>;
  sessionStore?: Pick<SessionStore, 'read' | 'toAnalysisRequest'>;
  securityFilter?: Pick<
    SecurityFilter,
    'sanitizeAnalysisRequest' | 'sanitizeResponse' | 'confirmSend' | 'sanitizeForDisplay'
  >;
  cacheFactory?: (ttl: number) => {
    get(request: AnalysisRequest): Promise<AnalysisResponse | null>;
    set(request: AnalysisRequest, response: AnalysisResponse): Promise<void>;
  };
  llmProviderFactory?: typeof createLLMProvider;
  credentialResolver?: CredentialResolverLike;
  formatter?: OutputFormatter;
}

export async function main(options: MainOptions = {}, dependencies: MainDependencies = {}): Promise<void> {
  const formatter = dependencies.formatter || new OutputFormatter();

  try {
    const configManager = dependencies.configManager || new ConfigManager();
    const sessionStore = dependencies.sessionStore || new SessionStore();
    const securityFilter = dependencies.securityFilter || new SecurityFilter();
    const createCache = dependencies.cacheFactory || ((ttl: number) => new CacheManager(ttl));
    const llmProviderFactory = dependencies.llmProviderFactory || createLLMProvider;
    const credentialResolver = dependencies.credentialResolver || new CredentialResolver();

    let sessionBundle: SanitizedSessionBundle;

    try {
      sessionBundle = await sessionStore.read();
    } catch (error) {
      const sessionErrorCode = getSessionErrorCode(error);

      if (sessionErrorCode === 'missing') {
        if (isShellIntegrationConfigured()) {
          const captureStatus = getShellCaptureStatus();
          if (captureStatus.kind === 'success') {
            throw new Error(
              'No failed command is currently available for analysis. Run repair immediately after a command that exits non-zero.',
            );
          }

          if (captureStatus.kind === 'skipped') {
            throw new Error(
              `The last failed command was excluded from capture by default because ${captureStatus.entrypoint || 'it'} is on the sensitive-command denylist.`,
            );
          }

          throw new Error(
            'No captured command output is available yet. Run a command in this shell, then run repair again.',
          );
        }

        throw new Error(
          'Shell integration is not configured. Add eval "$(repair init zsh)" or eval "$(repair init bash)" to your shell configuration, then restart your shell.',
        );
      }

      if (sessionErrorCode === 'invalid') {
        throw new Error(
          'The captured session data is invalid. Run another command, or reinstall shell integration with repair init <shell>.',
        );
      }

      throw error;
    }

    const config = await configManager.load();
    let apiKey: string | undefined;
    if (config.provider !== 'local') {
      try {
        apiKey = (await credentialResolver.resolve(config.provider))?.value;
      } catch (error) {
        if (error instanceof CredentialError) {
          throw new Error(credentialErrorMessage(error, config.provider, error.backend));
        }
        throw error;
      }
    }

    // Allow options to override config
    const effectiveConfig: Config = {
      ...config,
      ...(apiKey && { apiKey }),
      cacheEnabled: options.cacheEnabled !== undefined ? options.cacheEnabled : config.cacheEnabled,
      confirmBeforeSend: options.confirmBeforeSend !== undefined ? options.confirmBeforeSend : config.confirmBeforeSend,
    };

    configManager.validate(effectiveConfig);

    let analysisRequest: AnalysisRequest = {
      ...sessionStore.toAnalysisRequest(sessionBundle, effectiveConfig.includeCwd === true),
      captureMetadata: {
        truncated: sessionBundle.truncated,
        redactionsApplied: sessionBundle.redactionsApplied,
      },
    };
    analysisRequest = securityFilter.sanitizeAnalysisRequest(analysisRequest, {
      includeCwd: effectiveConfig.includeCwd,
      maxPersistedOutputBytes: effectiveConfig.maxPersistedOutputBytes,
    });

    if (options.verbose) {
      console.log(formatter.formatInfo(`Captured command: ${analysisRequest.command}`));
      console.log(formatter.formatInfo(`Captured output length: ${analysisRequest.output.length} chars`));
      if (analysisRequest.shellContext?.shell) {
        console.log(formatter.formatInfo(`Captured shell: ${analysisRequest.shellContext.shell}`));
      }
      if (analysisRequest.shellContext?.exitCode !== undefined) {
        console.log(formatter.formatInfo(`Exit code: ${analysisRequest.shellContext.exitCode}`));
      }
      if (sessionBundle.redactionsApplied > 0) {
        console.log(formatter.formatInfo(`Redactions applied: ${sessionBundle.redactionsApplied}`));
      }
      if (sessionBundle.truncated) {
        console.log(formatter.formatInfo('Captured output was truncated before persistence'));
      }
    }

    if (options.verbose) {
      console.log(formatter.formatInfo(`Using provider: ${effectiveConfig.provider}`));
      if (effectiveConfig.model) {
        console.log(formatter.formatInfo(`Using model: ${effectiveConfig.model}`));
      }
    }

    if (!analysisRequest.command || !analysisRequest.output) {
      throw new Error('Could not load captured command and output from shell session');
    }

    if (effectiveConfig.confirmBeforeSend) {
      const confirmed = await securityFilter.confirmSend(analysisRequest.command, analysisRequest.output, {
        truncated: sessionBundle.truncated,
        redactionsApplied: sessionBundle.redactionsApplied,
      });

      if (!confirmed) {
        console.log(formatter.formatInfo('Cancelled by user'));
        return;
      }
    }

    let response;
    let cacheManager:
      | {
          get(request: AnalysisRequest): Promise<AnalysisResponse | null>;
          set(request: AnalysisRequest, response: AnalysisResponse): Promise<void>;
        }
      | undefined;

    if (effectiveConfig.cacheEnabled) {
      cacheManager = createCache(effectiveConfig.cacheTTL || 24 * 60 * 60 * 1000);
      response = await cacheManager.get(analysisRequest);

      if (response) {
        if (options.verbose) {
          console.log(formatter.formatSuccess('Using cached response'));
        }
        console.log('\n' + formatter.formatResponse(response));
        return;
      }
    }

    if (options.verbose) {
      console.log(formatter.formatInfo('Analyzing error with LLM...'));
    }

    const llmProvider = llmProviderFactory(effectiveConfig);
    response = securityFilter.sanitizeResponse(await llmProvider.analyze(analysisRequest));

    if (effectiveConfig.cacheEnabled && cacheManager) {
      await cacheManager.set(analysisRequest, response);
    }

    console.log('\n' + formatter.formatResponse(response));
  } catch (error) {
    if (error instanceof Error) {
      console.error('\n' + formatter.formatError(error.message));

      // Provide helpful context for common errors
      if (error.message.includes('API') || error.message.includes('authentication')) {
        console.error('\n' + formatter.formatInfo('Check your API key configuration'));
        console.error(formatter.formatInfo('Run repair auth set on Linux/WSL, or set REPAIR_API_KEY'));
      }

      if (error.message.includes('rate limit')) {
        console.error('\n' + formatter.formatInfo('Try again later or use a different provider'));
      }

      if (error.message.includes('network') || error.message.includes('timeout')) {
        console.error('\n' + formatter.formatInfo('Check your internet connection'));
      }

      markErrorAsDisplayed(error);
    }

    throw error;
  }
}

function getSessionErrorCode(error: unknown): 'missing' | 'invalid' | undefined {
  if (error instanceof SessionError) {
    return error.code;
  }

  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'missing' || code === 'invalid') {
      return code;
    }
  }

  return undefined;
}
