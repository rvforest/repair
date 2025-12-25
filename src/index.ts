import { ConfigManager } from './config';
import { ZellijIntegration } from './zellij';
import { createLLMProvider } from './llm';
import { SecurityFilter } from './security';
import { CacheManager } from './cache';
import { OutputFormatter } from './output';
import { Config } from './types';

interface MainOptions {
  cacheEnabled?: boolean;
  confirmBeforeSend?: boolean;
  verbose?: boolean;
}

export async function main(options: MainOptions = {}): Promise<void> {
  const formatter = new OutputFormatter();

  try {
    // Initialize components
    const configManager = new ConfigManager();
    const zellijIntegration = new ZellijIntegration();
    const securityFilter = new SecurityFilter();

    // Step 1: Check if we're in Zellij
    const zellijInfo = await zellijIntegration.detectZellij();

    if (!zellijInfo.inZellij) {
      const isInstalled = await zellijIntegration.checkZellijInstalled();

      if (!isInstalled) {
        throw new Error(
          'Zellij is not installed. Please install Zellij to use this tool.\n' +
          'Visit: https://zellij.dev/documentation/installation'
        );
      }

      throw new Error(
        'This tool must be run inside a Zellij session.\n' +
        'Start Zellij with: zellij\n' +
        'Then run this command again.'
      );
    }

    if (options.verbose) {
      console.log(formatter.formatInfo(`Running in Zellij session: ${zellijInfo.sessionName}`));
      if (zellijInfo.version) {
        console.log(formatter.formatInfo(`Zellij version: ${zellijInfo.version}`));
      }
    }

    // Step 2: Check Zellij version
    const versionOk = await zellijIntegration.checkVersion('0.38.0');
    if (!versionOk) {
      console.log(
        formatter.formatWarning(
          'Zellij version may be incompatible. Recommended version: 0.38.0 or higher'
        )
      );
    }

    // Step 3: Load configuration
    const config = await configManager.load();

    // Allow options to override config
    const effectiveConfig: Config = {
      ...config,
      cacheEnabled: options.cacheEnabled !== undefined ? options.cacheEnabled : config.cacheEnabled,
      confirmBeforeSend: options.confirmBeforeSend !== undefined ? options.confirmBeforeSend : config.confirmBeforeSend,
    };

    configManager.validate(effectiveConfig);

    if (options.verbose) {
      console.log(formatter.formatInfo(`Using provider: ${effectiveConfig.provider}`));
      if (effectiveConfig.model) {
        console.log(formatter.formatInfo(`Using model: ${effectiveConfig.model}`));
      }
    }

    // Step 4: Get pane output and extract command
    if (options.verbose) {
      console.log(formatter.formatInfo('Retrieving terminal output...'));
    }

    const analysisRequest = await zellijIntegration.buildAnalysisRequest(
      effectiveConfig.scrollbackLines
    );

    if (!analysisRequest.command || !analysisRequest.output) {
      throw new Error('Could not extract command and output from terminal');
    }

    if (options.verbose) {
      console.log(formatter.formatInfo(`Command: ${analysisRequest.command}`));
      console.log(formatter.formatInfo(`Output length: ${analysisRequest.output.length} chars`));
    }

    // Step 5: Security check
    const hasSecrets = securityFilter.detectSecrets(
      analysisRequest.command + '\n' + analysisRequest.output
    );

    if (hasSecrets) {
      console.log(
        formatter.formatWarning('Potential secrets detected in output. Redacting before sending to LLM.')
      );
      analysisRequest.command = securityFilter.redactSecrets(analysisRequest.command);
      analysisRequest.output = securityFilter.redactSecrets(analysisRequest.output);
    }

    // Step 6: Confirmation if requested
    if (effectiveConfig.confirmBeforeSend) {
      const confirmed = await securityFilter.confirmSend(
        analysisRequest.command,
        analysisRequest.output
      );

      if (!confirmed) {
        console.log(formatter.formatInfo('Cancelled by user'));
        return;
      }
    }

    // Step 7: Check cache
    let response;
    let cacheManager: CacheManager | undefined;

    if (effectiveConfig.cacheEnabled) {
      cacheManager = new CacheManager(effectiveConfig.cacheTTL);
      response = await cacheManager.get(analysisRequest.command, analysisRequest.output);

      if (response) {
        if (options.verbose) {
          console.log(formatter.formatSuccess('Using cached response'));
        }
        console.log('\n' + formatter.formatResponse(response));
        return;
      }
    }

    // Step 8: Call LLM
    if (options.verbose) {
      console.log(formatter.formatInfo('Analyzing error with LLM...'));
    }

    const llmProvider = createLLMProvider(effectiveConfig);
    response = await llmProvider.analyze(analysisRequest);

    // Step 9: Cache the response
    if (effectiveConfig.cacheEnabled && cacheManager) {
      await cacheManager.set(analysisRequest.command, analysisRequest.output, response);
    }

    // Step 10: Display results
    console.log('\n' + formatter.formatResponse(response));

  } catch (error) {
    if (error instanceof Error) {
      console.error('\n' + formatter.formatError(error.message));

      // Provide helpful context for common errors
      if (error.message.includes('API') || error.message.includes('authentication')) {
        console.error('\n' + formatter.formatInfo('Check your API key configuration'));
        console.error(formatter.formatInfo('Set REPAIR_API_KEY environment variable or configure in ~/.config/repair/config.json'));
      }

      if (error.message.includes('rate limit')) {
        console.error('\n' + formatter.formatInfo('Try again later or use a different provider'));
      }

      if (error.message.includes('network') || error.message.includes('timeout')) {
        console.error('\n' + formatter.formatInfo('Check your internet connection'));
      }
    }

    throw error;
  }
}
