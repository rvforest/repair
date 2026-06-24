import { Command } from 'commander';
import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { CredentialResolverLike, CredentialStore, REMOTE_PROVIDERS } from '../credentials';
import { promptMasked, registerAuthCommands, removeCredential, setCredential, showCredentialStatus } from './index';

const testBackend = {
  id: 'test-store',
  displayName: 'test secure store',
};

function outputBuffer() {
  let value = '';
  const stream: Pick<NodeJS.WriteStream, 'write'> & Partial<Pick<NodeJS.WriteStream, 'isTTY'>> = {
    write: (chunk: string) => {
      value += chunk;
      return true;
    },
  };
  return {
    stream,
    value: () => value,
  };
}

describe('auth commands', () => {
  it('preflights before prompting and stores a provider-scoped credential', async () => {
    const calls: string[] = [];
    const store = {
      backend: testBackend,
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

    const storeFactory = vi.fn(() => store);
    await setCredential('anthropic', false, {
      storeFactory,
      promptSecret,
      stdout: output.stream,
    });

    expect(storeFactory).toHaveBeenCalledOnce();
    expect(calls).toEqual(['preflight', 'exists', 'prompt', 'set']);
    expect(store.set).toHaveBeenCalledWith('anthropic', 'secret-value');
    expect(output.value()).toContain('test secure store');
    expect(output.value()).not.toContain('secret-value');
  });

  it('does not prompt when overwrite is declined', async () => {
    const store = {
      backend: testBackend,
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
      backend: testBackend,
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

  it('reports secure-store status without displaying or retrieving the credential', async () => {
    const output = outputBuffer();
    await showCredentialStatus('openrouter', {
      store: {
        backend: testBackend,
      } as unknown as CredentialStore,
      resolver: {
        status: vi.fn().mockResolvedValue({ source: 'secure-store', backend: testBackend }),
      } as unknown as CredentialResolverLike,
      stdout: output.stream,
    });
    expect(output.value()).toBe('openrouter: secure-store (test secure store)\n');
  });

  it('reports every remote provider and marks the active provider when status has no argument', async () => {
    const output = outputBuffer();
    const status = vi.fn(async (provider: string) => ({
      source: provider === 'openrouter' ? 'secure-store' : 'missing',
      ...(provider === 'openrouter' && { backend: testBackend }),
    }));

    await showCredentialStatus(undefined, {
      configManager: {
        load: vi.fn().mockResolvedValue({ provider: 'openai' }),
      },
      store: {
        backend: testBackend,
      } as unknown as CredentialStore,
      resolver: { status } as unknown as CredentialResolverLike,
      stdout: output.stream,
    });

    expect(status).toHaveBeenCalledTimes(REMOTE_PROVIDERS.length);
    for (const provider of REMOTE_PROVIDERS) {
      expect(output.value()).toContain(provider);
    }
    expect(output.value()).toContain('openai (active)');
    expect(output.value()).toMatch(/openai \(active\)\s+missing/);
    expect(output.value()).toMatch(/openrouter\s+secure-store \(test secure store\)/);
  });

  it('applies an environment credential only to the active provider in inventory status', async () => {
    const output = outputBuffer();
    const status = vi.fn(async (_provider: string, options?: { includeEnvironment?: boolean }) =>
      options?.includeEnvironment
        ? { source: 'env', maskedValue: '******uter' }
        : { source: 'missing', errorCode: 'missing' },
    );

    await showCredentialStatus(undefined, {
      configManager: {
        load: vi.fn().mockResolvedValue({ provider: 'openrouter' }),
      },
      store: {
        backend: testBackend,
      } as unknown as CredentialStore,
      resolver: { status } as unknown as CredentialResolverLike,
      stdout: output.stream,
    });

    for (const provider of REMOTE_PROVIDERS) {
      expect(status).toHaveBeenCalledWith(provider, {
        includeEnvironment: provider === 'openrouter',
      });
    }
    expect(output.value()).toMatch(/openrouter \(active\)\s+env \*{6}uter/);
  });

  it('reports a local active provider without treating an environment credential as remote', async () => {
    const output = outputBuffer();
    const status = vi.fn().mockResolvedValue({ source: 'missing', errorCode: 'missing' });

    await showCredentialStatus(undefined, {
      configManager: {
        load: vi.fn().mockResolvedValue({ provider: 'local' }),
      },
      store: {
        backend: testBackend,
      } as unknown as CredentialStore,
      resolver: { status } as unknown as CredentialResolverLike,
      stdout: output.stream,
    });

    expect(output.value()).toContain('Active provider: local (no credential required)');
    expect(output.value()).not.toContain('local (active)');
    for (const provider of REMOTE_PROVIDERS) {
      expect(status).toHaveBeenCalledWith(provider, {
        includeEnvironment: false,
      });
    }
  });

  it('initiates all inventory status checks before waiting for any one result', async () => {
    const pending: Array<(status: { source: 'missing'; errorCode: 'missing' }) => void> = [];
    const status = vi.fn(
      () =>
        new Promise<{ source: 'missing'; errorCode: 'missing' }>((resolve) => {
          pending.push(resolve);
        }),
    );
    const result = showCredentialStatus(undefined, {
      configManager: {
        load: vi.fn().mockResolvedValue({ provider: 'openai' }),
      },
      store: {
        backend: testBackend,
      } as unknown as CredentialStore,
      resolver: { status } as unknown as CredentialResolverLike,
      stdout: outputBuffer().stream,
    });

    await vi.waitFor(() => expect(status).toHaveBeenCalledTimes(REMOTE_PROVIDERS.length));
    for (const resolve of pending) resolve({ source: 'missing', errorCode: 'missing' });
    await result;
  });

  it('warns after storing a credential for a provider that is not active', async () => {
    const output = outputBuffer();
    const store = {
      backend: testBackend,
      preflight: vi.fn(),
      exists: vi.fn().mockResolvedValue(false),
      set: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
    };

    await setCredential('openrouter', false, {
      configManager: {
        load: vi.fn().mockResolvedValue({ provider: 'openai' }),
      },
      store,
      promptSecret: vi.fn().mockResolvedValue('secret'),
      stdout: output.stream,
    });

    expect(output.value()).toContain('Stored credential for openrouter');
    expect(output.value()).toContain('active provider is openai');
    expect(output.value()).toContain('REPAIR_PROVIDER=openrouter');
  });

  it('does not warn after storing a credential for the active provider', async () => {
    const output = outputBuffer();
    const store = {
      backend: testBackend,
      preflight: vi.fn(),
      exists: vi.fn().mockResolvedValue(false),
      set: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
    };

    await setCredential('openrouter', false, {
      configManager: {
        load: vi.fn().mockResolvedValue({ provider: 'openrouter' }),
      },
      store,
      promptSecret: vi.fn().mockResolvedValue('secret'),
      stdout: output.stream,
    });

    expect(output.value()).toBe('Stored credential for openrouter in test secure store.\n');
  });

  it('removes credentials and handles missing entries gracefully', async () => {
    const output = outputBuffer();
    const store = {
      backend: testBackend,
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
          backend: testBackend,
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
      backend: testBackend,
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

  it.each(['set', 'remove'])('lists remote providers in auth %s help', (subcommand) => {
    const program = new Command();
    registerAuthCommands(program);

    const auth = program.commands.find((command) => command.name() === 'auth');
    const command = auth?.commands.find((candidate) => candidate.name() === subcommand);
    const help = command?.helpInformation();
    const normalizedHelp = help?.replace(/\s+/g, ' ');

    expect(normalizedHelp).toContain(REMOTE_PROVIDERS.join(', '));
    expect(normalizedHelp).toContain('defaults to the configured provider');
    expect(normalizedHelp).not.toContain('local');
  });

  it('explains that auth status lists all providers when its argument is omitted', () => {
    const program = new Command();
    registerAuthCommands(program);

    const auth = program.commands.find((command) => command.name() === 'auth');
    const command = auth?.commands.find((candidate) => candidate.name() === 'status');
    const normalizedHelp = command?.helpInformation().replace(/\s+/g, ' ');

    expect(normalizedHelp).toContain(REMOTE_PROVIDERS.join(', '));
    expect(normalizedHelp).toContain('omit to list all providers');
    expect(normalizedHelp).not.toContain('local');
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
      signalTarget: signals as unknown as Pick<NodeJS.Process, 'once' | 'off'>,
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
      signalTarget: new EventEmitter() as unknown as Pick<NodeJS.Process, 'once' | 'off'>,
      terminate: vi.fn(),
    });

    stdin.emit('error', new Error('read failure'));

    await expect(result).rejects.toThrow('input failed');
    expect(stdin.setRawMode).toHaveBeenLastCalledWith(false);
    expect(stdin.pause).toHaveBeenCalled();
  });
});
