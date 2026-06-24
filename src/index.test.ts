import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wasErrorDisplayed } from './errors';
import { main } from './index';
import { ProviderHttpError } from './llm/base';
import { AnalysisRequest, AnalysisResponse, Config, SanitizedSessionBundle } from './types';

type MainDependencies = NonNullable<Parameters<typeof main>[1]>;

describe('main shell-session flow', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('shows shell integration guidance when no integration is configured', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const missingSessionError = {
      name: 'SessionError',
      code: 'missing',
      message: 'missing',
    };

    let thrownError: Error | undefined;

    try {
      await main(
        {},
        {
          sessionStore: {
            read: vi.fn().mockRejectedValue(missingSessionError),
            toAnalysisRequest: vi.fn(),
          } as unknown as MainDependencies['sessionStore'],
        },
      );
    } catch (error) {
      thrownError = error as Error;
    }

    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError?.message).toContain('Shell integration is not configured');
    expect(errorSpy).toHaveBeenCalled();
    expect(thrownError && wasErrorDisplayed(thrownError)).toBe(true);
  });

  it('shows no-command guidance when integration is loaded but no session exists', async () => {
    process.env.REPAIR_SHELL_INTEGRATION = '1';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const missingSessionError = {
      name: 'SessionError',
      code: 'missing',
      message: 'missing',
    };

    await expect(
      main(
        {},
        {
          sessionStore: {
            read: vi.fn().mockRejectedValue(missingSessionError),
            toAnalysisRequest: vi.fn(),
          } as unknown as MainDependencies['sessionStore'],
        },
      ),
    ).rejects.toThrow('No captured command output is available yet');

    expect(errorSpy).toHaveBeenCalled();
  });

  it('reports when the most recent command succeeded and no failed session remains', async () => {
    process.env.REPAIR_SHELL_INTEGRATION = '1';
    process.env.REPAIR_LAST_CAPTURE_STATUS = 'success';

    await expect(
      main(
        {},
        {
          sessionStore: {
            read: vi.fn().mockRejectedValue({ code: 'missing' }),
            toAnalysisRequest: vi.fn(),
          } as unknown as MainDependencies['sessionStore'],
        },
      ),
    ).rejects.toThrow('No failed command is currently available for analysis');
  });

  it('reports when a sensitive command was skipped', async () => {
    process.env.REPAIR_SHELL_INTEGRATION = '1';
    process.env.REPAIR_LAST_CAPTURE_STATUS = 'skipped:sudo';

    await expect(
      main(
        {},
        {
          sessionStore: {
            read: vi.fn().mockRejectedValue({ code: 'missing' }),
            toAnalysisRequest: vi.fn(),
          } as unknown as MainDependencies['sessionStore'],
        },
      ),
    ).rejects.toThrow('excluded from capture by default');
  });

  it('prefers an existing capturable failure over a newer skipped sensitive command', async () => {
    process.env.REPAIR_SHELL_INTEGRATION = '1';
    process.env.REPAIR_LAST_CAPTURE_STATUS = 'skipped:sudo';

    const sanitizedBundle: SanitizedSessionBundle = {
      command: 'npm test',
      output: 'Error: boom',
      exitCode: 1,
      timestamp: '2026-04-01T12:00:00.000Z',
      shell: 'zsh',
      truncated: false,
      redactionsApplied: 0,
    };

    const analyze = vi.fn().mockResolvedValue({
      explanation: 'Previous failure',
      directFixes: [],
      debugSteps: ['npm install'],
    } satisfies AnalysisResponse);

    await main(
      {},
      {
        sessionStore: {
          read: vi.fn().mockResolvedValue(sanitizedBundle),
          toAnalysisRequest: vi.fn().mockReturnValue({
            command: 'npm test',
            output: 'Error: boom',
            shellContext: {
              exitCode: 1,
              shell: 'zsh',
              timestamp: '2026-04-01T12:00:00.000Z',
            },
          }),
        } as unknown as MainDependencies['sessionStore'],
        configManager: {
          load: vi.fn().mockResolvedValue({
            provider: 'local',
            model: 'llama3',
            cacheEnabled: false,
            confirmBeforeSend: false,
            includeCwd: false,
          } satisfies Config),
          validate: vi.fn(),
        },
        llmProviderFactory: vi.fn().mockReturnValue({ analyze }),
      },
    );

    expect(analyze).toHaveBeenCalledOnce();
  });

  it('analyzes a captured session, redacts secrets, and uses cache with shell metadata', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const sanitizedBundle: SanitizedSessionBundle = {
      command: 'curl https://example.com?token=[REDACTED:OPENAI_KEY]',
      output: 'Error: invalid token [REDACTED:OPENAI_KEY]',
      exitCode: 1,
      timestamp: '2026-04-01T12:00:00.000Z',
      shell: 'zsh',
      truncated: false,
      redactionsApplied: 2,
    };

    const analysisRequest: AnalysisRequest = {
      command: sanitizedBundle.command,
      output: sanitizedBundle.output,
      shellContext: {
        shell: 'zsh',
        exitCode: 1,
        timestamp: '2026-04-01T12:00:00.000Z',
      },
    };

    const analyze = vi.fn().mockResolvedValue({
      explanation: 'Bad token',
      directFixes: ['export REPAIR_API_KEY=...'],
      debugSteps: ['printenv REPAIR_API_KEY'],
    } satisfies AnalysisResponse);

    const cacheGet = vi.fn().mockResolvedValue(null);
    const cacheSet = vi.fn().mockResolvedValue(undefined);
    const validate = vi.fn();

    await main(
      { cacheEnabled: true },
      {
        sessionStore: {
          read: vi.fn().mockResolvedValue(sanitizedBundle),
          toAnalysisRequest: vi.fn().mockReturnValue(analysisRequest),
        } as unknown as MainDependencies['sessionStore'],
        configManager: {
          load: vi.fn().mockResolvedValue({
            provider: 'local',
            model: 'llama3',
            cacheEnabled: true,
            cacheTTL: 1000,
            includeCwd: false,
            confirmBeforeSend: false,
          } satisfies Config),
          validate,
        },
        cacheFactory: () => ({ get: cacheGet, set: cacheSet }),
        llmProviderFactory: vi.fn().mockReturnValue({ analyze }),
      },
    );

    expect(validate).toHaveBeenCalled();
    expect(cacheGet).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.stringContaining('[REDACTED:'),
        output: expect.stringContaining('[REDACTED:'),
        shellContext: expect.objectContaining({ exitCode: 1, shell: 'zsh' }),
      }),
    );
    expect(analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.stringContaining('[REDACTED:'),
        output: expect.stringContaining('[REDACTED:'),
        shellContext: expect.objectContaining({
          timestamp: '2026-04-01T12:00:00.000Z',
        }),
      }),
    );
    expect(cacheSet).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
  });

  it('does not resolve credentials when the user declines confirmation', async () => {
    const resolve = vi.fn();
    const providerFactory = vi.fn();

    await main(
      { cacheEnabled: false, confirmBeforeSend: true },
      {
        sessionStore: {
          read: vi.fn().mockResolvedValue({
            command: 'false',
            output: 'failed',
            exitCode: 1,
            timestamp: '2026-06-20T00:00:00.000Z',
            truncated: false,
            redactionsApplied: 0,
          }),
          toAnalysisRequest: vi.fn().mockReturnValue({ command: 'false', output: 'failed' }),
        } as unknown as MainDependencies['sessionStore'],
        configManager: {
          load: vi.fn().mockResolvedValue({
            provider: 'openai',
            cacheEnabled: false,
            confirmBeforeSend: true,
          }),
          validate: vi.fn(),
        },
        securityFilter: {
          sanitizeAnalysisRequest: vi.fn((request) => request),
          confirmSend: vi.fn().mockResolvedValue(false),
        } as unknown as MainDependencies['securityFilter'],
        credentialResolver: {
          resolve,
          status: vi.fn(),
        },
        llmProviderFactory: providerFactory,
      },
    );

    expect(resolve).not.toHaveBeenCalled();
    expect(providerFactory).not.toHaveBeenCalled();
  });

  it('does not resolve credentials when a cached response is available', async () => {
    const resolve = vi.fn();
    const providerFactory = vi.fn();

    await main(
      { cacheEnabled: true },
      {
        sessionStore: {
          read: vi.fn().mockResolvedValue({
            command: 'false',
            output: 'failed',
            exitCode: 1,
            timestamp: '2026-06-20T00:00:00.000Z',
            truncated: false,
            redactionsApplied: 0,
          }),
          toAnalysisRequest: vi.fn().mockReturnValue({ command: 'false', output: 'failed' }),
        } as unknown as MainDependencies['sessionStore'],
        configManager: {
          load: vi.fn().mockResolvedValue({
            provider: 'openai',
            cacheEnabled: true,
            confirmBeforeSend: false,
          }),
          validate: vi.fn(),
        },
        cacheFactory: () => ({
          get: vi.fn().mockResolvedValue({
            explanation: 'cached',
            directFixes: [],
            debugSteps: [],
          }),
          set: vi.fn(),
        }),
        credentialResolver: {
          resolve,
          status: vi.fn(),
        },
        llmProviderFactory: providerFactory,
      },
    );

    expect(resolve).not.toHaveBeenCalled();
    expect(providerFactory).not.toHaveBeenCalled();
  });

  it('resolves a remote provider credential before provider construction without logging it', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const secret = 'runtime-secret-value';
    const providerFactory = vi.fn().mockReturnValue({
      analyze: vi.fn().mockResolvedValue({
        explanation: 'ok',
        directFixes: [],
        debugSteps: [],
      }),
    });

    await main(
      { cacheEnabled: false, verbose: true },
      {
        sessionStore: {
          read: vi.fn().mockResolvedValue({
            command: 'false',
            output: 'failed',
            exitCode: 1,
            timestamp: '2026-06-20T00:00:00.000Z',
            truncated: false,
            redactionsApplied: 0,
          }),
          toAnalysisRequest: vi.fn().mockReturnValue({ command: 'false', output: 'failed' }),
        } as unknown as MainDependencies['sessionStore'],
        configManager: {
          load: vi.fn().mockResolvedValue({
            provider: 'openai',
            cacheEnabled: false,
            confirmBeforeSend: false,
          }),
          validate: vi.fn(),
        },
        credentialResolver: {
          resolve: vi.fn().mockResolvedValue({ source: 'secure-store', value: secret }),
          status: vi.fn(),
        },
        llmProviderFactory: providerFactory,
      },
    );

    expect(providerFactory).toHaveBeenCalledWith(expect.objectContaining({ apiKey: secret }));
    expect(logSpy.mock.calls.flat().join(' ')).not.toContain(secret);
  });

  it('shows model guidance instead of API-key guidance for invalid provider models', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const providerFactory = vi.fn().mockReturnValue({
      analyze: vi.fn().mockRejectedValue(
        new ProviderHttpError(
          'OpenRouter',
          400,
          'Bad Request',
          'Invalid model anthropic/claude-haiku-4-5-20251001',
        ),
      ),
    });

    await expect(
      main(
        { cacheEnabled: false },
        {
          sessionStore: {
            read: vi.fn().mockResolvedValue({
              command: 'false',
              output: 'failed',
              exitCode: 1,
              timestamp: '2026-06-20T00:00:00.000Z',
              truncated: false,
              redactionsApplied: 0,
            }),
            toAnalysisRequest: vi.fn().mockReturnValue({ command: 'false', output: 'failed' }),
          } as unknown as MainDependencies['sessionStore'],
          configManager: {
            load: vi.fn().mockResolvedValue({
              provider: 'local',
              cacheEnabled: false,
              confirmBeforeSend: false,
            }),
            validate: vi.fn(),
          },
          llmProviderFactory: providerFactory,
        },
      ),
    ).rejects.toThrow('Invalid model');

    const output = errorSpy.mock.calls.flat().join('\n');
    expect(output).toContain('Check your model configuration');
    expect(output).toContain('REPAIR_MODEL');
    expect(output).toContain('provider model catalog');
    expect(output).not.toContain('Check your API key configuration');
    expect(output).not.toContain('REPAIR_API_KEY');
  });
});
