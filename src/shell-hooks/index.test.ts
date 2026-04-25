import { describe, expect, it } from 'vitest';
import { generateShellInit, getSupportedShells } from './index';

describe('shell hook generation', () => {
  it('lists supported shells', () => {
    expect(getSupportedShells()).toEqual(['bash', 'zsh']);
  });

  it('generates a zsh snippet with the session writer command', () => {
    const snippet = generateShellInit('zsh');

    expect(snippet).toContain('add-zsh-hook preexec repair_preexec');
    expect(snippet).toContain('repair _write-session');
    expect(snippet).toContain('REPAIR_SHELL_INTEGRATION=1');
    expect(snippet).toContain('repair_start_redirect');
    expect(snippet).toContain('repair_restore_redirect');
  });

  it('generates a bash snippet with DEBUG and PROMPT_COMMAND hooks', () => {
    const snippet = generateShellInit('bash');

    expect(snippet).toContain("trap 'repair_debug_trap' DEBUG");
    expect(snippet).toContain("PROMPT_COMMAND='repair_prompt_command'");
    expect(snippet).toContain('repair _write-session');
    expect(snippet).toContain('repair_start_redirect');
    expect(snippet).toContain('repair_restore_redirect');
  });

  it('rejects unsupported shells with guidance', () => {
    expect(() => generateShellInit('fish')).toThrow('Supported shells: bash, zsh');
  });
});