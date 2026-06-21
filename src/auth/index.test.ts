import { Command } from 'commander';
import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { promptMasked, registerAuthCommands, removeCredential, setCredential, showCredentialStatus } from './index';

function outputBuffer() {
  let value = '';
  return {
    stream: {
      write: (chunk: string) => {
        value += chunk;
        return true;
      },
    } as any,
    value: () => value,
  };
}

describe('auth commands', () => {
  it('preflights before prompting and stores a provider-scoped credential', async () => {
    const calls: string[] = [];
    const store = {
      preflight: vi.fn(async () => {
        calls.push('preflight');
      }),
      exists: vi.fn(async () => {
        calls.push('exists');
        return false;
      }),
      set: vi.fn(async () => {
        calls.push('set');
      }),
      get: vi.fn(),
      remove: vi.fn(),
    };
    const promptSecret = vi.fn(async () => {
      calls.push('prompt');
      return 'secret-value';
    });
    const output = outputBuffer();

    await setCredential('anthropic', false, {
      store,
      promptSecret,
      stdout: output.stream,
    });

    expect(calls).toEqual(['preflight', 'exists', 'prompt', 'set']);
    expect(store.set).toHaveBeenCalledWith('anthropic', 'secret-value');
    expect(output.value()).not.toContain('secret-value');
  });

  it('does not prompt when overwrite is declined', async () => {
    const store = {
      preflight: vi.fn(),
      exists: vi.fn().mockResolvedValue(true),
      set: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
    };
    const promptSecret = vi.fn();
    const output = outputBuffer();

    await setCredential('openai', false, {
      store,
      promptConfirm: vi.fn().mockResolvedValue(false),
      promptSecret,
      stdout: output.stream,
    });

    expect(promptSecret).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });

  it('forces overwrite but still prompts securely for the new value', async () => {
    const store = {
      preflight: vi.fn(),
      exists: vi.fn().mockResolvedValue(true),
      set: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
    };
    const promptConfirm = vi.fn();
    await setCredential('google', true, {
      store,
      promptConfirm,
      promptSecret: vi.fn().mockResolvedValue('new-secret'),
      stdout: outputBuffer().stream,
    });
    expect(promptConfirm).not.toHaveBeenCalled();
    expect(store.set).toHaveBeenCalledWith('google', 'new-secret');
  });

  it('reports pass status without displaying or retrieving the credential', async () => {
    const output = outputBuffer();
    await showCredentialStatus('openrouter', {
      resolver: {
        status: vi.fn().mockResolvedValue({ source: 'pass' }),
      } as any,
      stdout: output.stream,
    });
    expect(output.value()).toBe('openrouter: pass\n');
  });

  it('removes credentials and handles missing entries gracefully', async () => {
    const output = outputBuffer();
    const store = {
      remove: vi.fn().mockResolvedValue(false),
      preflight: vi.fn(),
      exists: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
    };
    await removeCredential('openai', { store, stdout: output.stream });
    expect(output.value()).toContain('No stored credential');
  });

  it('rejects invalid and local providers before store access', async () => {
    await expect(setCredential('bad', false)).rejects.toThrow('Invalid remote provider');
    await expect(
      setCredential(undefined, false, {
        configManager: {
          load: vi.fn().mockResolvedValue({ provider: 'local' }),
        },
      }),
    ).rejects.toThrow('Local providers');
  });

  it('fails backend preflight before prompting', async () => {
    const promptSecret = vi.fn();
    await expect(
      setCredential('openai', false, {
        store: {
          preflight: vi.fn().mockRejectedValue(new Error('backend unavailable')),
          exists: vi.fn(),
          get: vi.fn(),
          set: vi.fn(),
          remove: vi.fn(),
        },
        promptSecret,
      }),
    ).rejects.toThrow('backend unavailable');
    expect(promptSecret).not.toHaveBeenCalled();
  });

  it('rejects positional secret values during command parsing', async () => {
    const program = new Command();
    program.exitOverride();
    program.configureOutput({ writeErr: () => undefined });
    const store = {
      preflight: vi.fn(),
      exists: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    };
    registerAuthCommands(program, { store });

    await expect(
      program.parseAsync(['node', 'repair', 'auth', 'set', 'openai', 'secret-in-history']),
    ).rejects.toMatchObject({ code: 'commander.excessArguments' });
    expect(store.preflight).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });
});

describe('masked prompt', () => {
  function fakeTerminal() {
    const stdin = new EventEmitter() as NodeJS.ReadStream;
    Object.assign(stdin, {
      isTTY: true,
      isRaw: false,
      isPaused: vi.fn(() => true),
      setRawMode: vi.fn((enabled: boolean) => {
        stdin.isRaw = enabled;
        return stdin;
      }),
      resume: vi.fn(() => stdin),
      pause: vi.fn(() => stdin),
    });
    const output = outputBuffer();
    Object.assign(output.stream, { isTTY: true });
    return { stdin, output };
  }

  it('restores terminal state before propagating termination signals', async () => {
    const { stdin, output } = fakeTerminal();
    const signals = new EventEmitter();
    const terminate = vi.fn();
    const result = promptMasked('Credential: ', {
      stdin,
      stdout: output.stream,
      signalTarget: signals as any,
      terminate,
    });

    expect(stdin.isRaw).toBe(true);
    signals.emit('SIGTERM');

    await expect(result).rejects.toThrow('cancelled');
    expect(stdin.setRawMode).toHaveBeenLastCalledWith(false);
    expect(stdin.pause).toHaveBeenCalled();
    expect(terminate).toHaveBeenCalledWith('SIGTERM');
  });

  it('restores terminal state when stdin fails', async () => {
    const { stdin, output } = fakeTerminal();
    const result = promptMasked('Credential: ', {
      stdin,
      stdout: output.stream,
      signalTarget: new EventEmitter() as any,
      terminate: vi.fn(),
    });

    stdin.emit('error', new Error('read failure'));

    await expect(result).rejects.toThrow('input failed');
    expect(stdin.setRawMode).toHaveBeenLastCalledWith(false);
    expect(stdin.pause).toHaveBeenCalled();
  });
});
