import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from './index';
import { AnalysisRequest, AnalysisResponse, Config } from './types';

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
    const missingSessionError = { name: 'SessionError', code: 'missing', message: 'missing' };

    await expect(
      main({}, {
        sessionStore: {
          read: vi.fn().mockRejectedValue(missingSessionError),
          toAnalysisRequest: vi.fn(),
        } as any,
      }),
    ).rejects.toThrow('Shell integration is not configured');

    expect(errorSpy).toHaveBeenCalled();
  });

  it('shows no-command guidance when integration is loaded but no session exists', async () => {
    process.env.REPAIR_SHELL_INTEGRATION = '1';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const missingSessionError = { name: 'SessionError', code: 'missing', message: 'missing' };

    await expect(
      main({}, {
        sessionStore: {
          read: vi.fn().mockRejectedValue(missingSessionError),
          toAnalysisRequest: vi.fn(),
        } as any,
      }),
    ).rejects.toThrow('No captured command output is available yet');

    expect(errorSpy).toHaveBeenCalled();
  });

  it('analyzes a captured session, redacts secrets, and uses cache with shell metadata', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const analysisRequest: AnalysisRequest = {
      command: 'curl https://example.com?token=sk-12345678901234567890123456789012',
      output: 'Error: invalid token sk-12345678901234567890123456789012',
      shellContext: {
        cwd: '/tmp/project',
        shell: 'zsh',
        exitCode: 1,
        timestamp: '2026-04-01T12:00:00.000Z',
      },
    };

    const analyze = vi.fn().mockResolvedValue({
      explanation: 'Bad token',
      fixes: ['export REPAIR_API_KEY=...'],
    } satisfies AnalysisResponse);

    const cacheGet = vi.fn().mockResolvedValue(null);
    const cacheSet = vi.fn().mockResolvedValue(undefined);
    const validate = vi.fn();

    await main(
      { cacheEnabled: true },
      {
        sessionStore: {
          read: vi.fn().mockResolvedValue({}),
          toAnalysisRequest: vi.fn().mockReturnValue(analysisRequest),
        } as any,
        configManager: {
          load: vi.fn().mockResolvedValue({
            provider: 'local',
            model: 'llama3',
            cacheEnabled: true,
            cacheTTL: 1000,
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
        command: expect.stringContaining('[REDACTED]'),
        output: expect.stringContaining('[REDACTED]'),
        shellContext: expect.objectContaining({ exitCode: 1, shell: 'zsh' }),
      }),
    );
    expect(analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.stringContaining('[REDACTED]'),
        output: expect.stringContaining('[REDACTED]'),
        shellContext: expect.objectContaining({ timestamp: '2026-04-01T12:00:00.000Z' }),
      }),
    );
    expect(cacheSet).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
  });
});