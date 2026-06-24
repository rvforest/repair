import fetch from 'node-fetch';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderHttpError } from './base';
import { OpenRouterProvider } from './openrouter';

vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

const mockedFetch = vi.mocked(fetch);

describe('OpenRouterProvider', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it('uses the current OpenRouter Claude Haiku default model', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                explanation: 'fixed',
                directFixes: [],
                debugSteps: [],
              }),
            },
          },
        ],
      }),
    } as never);

    const provider = new OpenRouterProvider('sk-or-test');

    await provider.analyze({
      command: 'npm test',
      output: 'failed',
    });

    const requestBody = JSON.parse(String(mockedFetch.mock.calls[0][1]?.body)) as { model: string };
    expect(requestBody.model).toBe('anthropic/claude-haiku-4.5');
  });

  it('preserves sanitized bounded invalid-model provider details', async () => {
    const secret = `sk-or-${'a'.repeat(80)}`;
    const longTail = 'x'.repeat(800);
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: vi.fn().mockResolvedValue(JSON.stringify({
        error: {
          message: `Invalid model anthropic/claude-haiku-4-5-20251001 for Authorization: Bearer ${secret} ${longTail}`,
        },
      })),
    } as never);

    const provider = new OpenRouterProvider('sk-or-test');

    let thrownError: ProviderHttpError | undefined;

    try {
      await provider.analyze({
        command: 'npm test',
        output: 'failed',
      });
    } catch (error) {
      thrownError = error as ProviderHttpError;
    }

    expect(thrownError).toMatchObject({
      name: 'ProviderHttpError',
      providerName: 'OpenRouter',
      status: 400,
      kind: 'invalid-model',
    });
    expect(thrownError?.message).toContain('Invalid model anthropic/claude-haiku-4-5-20251001');
    expect(thrownError?.message).toContain('[REDACTED:AUTHORIZATION]');
    expect(thrownError?.message).toContain('[TRUNCATED]');
    expect(thrownError?.message).not.toContain(secret);
    expect(thrownError?.message.length).toBeLessThan(600);
  });
});
