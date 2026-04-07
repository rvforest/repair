import { describe, expect, it } from 'vitest';
import { SecurityFilter, TerminalSanitizer } from './index';

describe('TerminalSanitizer', () => {
  it('strips ANSI and OSC control sequences', () => {
    const sanitizer = new TerminalSanitizer();
    const input = '\u001b[31mboom\u001b[0m\u001b]52;c;ZXZpbA==\u0007\nnext';

    expect(sanitizer.sanitize(input)).toBe('boom\nnext');
  });
});

describe('SecurityFilter', () => {
  const filter = new SecurityFilter();

  it('redacts secrets deterministically', () => {
    const input = 'token sk-12345678901234567890123456789012';

    expect(filter.redactSecrets(input)).toBe(filter.redactSecrets(input));
    expect(filter.redactSecrets(input)).toContain('[REDACTED:OPENAI_KEY]');
  });

  it('sanitizes session bundles before persistence', () => {
    const bundle = filter.sanitizeSessionBundle(
      {
        command: 'printf "\u001b[31mboom\u001b[0m" && echo sk-12345678901234567890123456789012',
        output: `line one\n${'x'.repeat(32 * 1024)}\nsk-12345678901234567890123456789012`,
        exitCode: 1,
        timestamp: '2026-04-01T12:00:00.000Z',
        cwd: '/tmp/secret-sk-12345678901234567890123456789012',
        shell: 'zsh',
      },
      { includeCwd: true, maxPersistedOutputBytes: 1024, stdinWasTruncated: true },
    );

    expect(bundle.command).not.toContain('\u001b[');
    expect(bundle.command).toContain('[REDACTED:OPENAI_KEY]');
    expect(bundle.output).toContain('[REDACTED:OPENAI_KEY]');
    expect(bundle.output).toContain('[TRUNCATED]');
    expect(bundle.cwd).toContain('[REDACTED:OPENAI_KEY]');
    expect(bundle.truncated).toBe(true);
    expect(bundle.redactionsApplied).toBeGreaterThan(0);
  });
});
