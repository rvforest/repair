import { describe, expect, it } from 'vitest';
import { generateShellInit, getSupportedShells } from './index';

describe('shell hook generation', () => {
  it('lists supported shells', () => {
    expect(getSupportedShells()).toEqual(['bash', 'zsh']);
  });

  it('generates a zsh snippet with secure stdin capture and cleanup hooks', () => {
    const snippet = generateShellInit('zsh');

    expect(snippet).toContain('add-zsh-hook preexec repair_preexec');
    expect(snippet).toContain('repair _capture-session');
    expect(snippet).toContain('add-zsh-hook zshexit repair_zsh_cleanup');
    expect(snippet).toContain('sudo|doas|su|pass|op|bw|vault|secret-tool|security|env|printenv');
    expect(snippet).toContain('REPAIR_SHELL_INTEGRATION=1');
  });

  it('generates a bash snippet with DEBUG, PROMPT_COMMAND, and cleanup hooks', () => {
    const snippet = generateShellInit('bash');

    expect(snippet).toContain("trap 'repair_debug_trap' DEBUG");
    expect(snippet).toContain("trap 'repair_shell_cleanup' EXIT");
    expect(snippet).toContain("PROMPT_COMMAND='repair_prompt_command'");
    expect(snippet).toContain('repair _capture-session');
    expect(snippet).toContain('< "$REPAIR_LAST_OUTPUT_FILE"');
  });

  it('skips sensitive commands by default without over-skipping cat', () => {
    const snippet = generateShellInit('bash');

    expect(snippet).toContain('sudo|doas|su|pass|op|bw|vault|secret-tool|security|env|printenv');
    expect(snippet).not.toContain('cat|');
  });

  it('rejects unsupported shells with guidance', () => {
    expect(() => generateShellInit('fish')).toThrow('Supported shells: bash, zsh');
  });
});