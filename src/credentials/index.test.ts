import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCredentialStore,
  CredentialError,
  CredentialResolver,
  maskCredential,
  PassCredentialStore,
} from './index';

const testBackend = {
  id: 'test-store',
  displayName: 'test secure store',
};

function fakeChild(code: number, stdout = '', stderr = ''): any {
  const child = new EventEmitter() as any;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.kill = vi.fn(() => true);
  child.stdin.on('finish', () => {
    queueMicrotask(() => {
      if (stdout) child.stdout.write(stdout);
      if (stderr) child.stderr.write(stderr);
      child.stdout.end();
      child.stderr.end();
      child.emit('close', code);
    });
  });
  return child;
}

describe('credential utilities', () => {
  it('masks short and long credentials', () => {
    expect(maskCredential('short')).toBe('*****');
    expect(maskCredential('1234567890ABCD')).toBe('******ABCD');
  });
});

describe('PassCredentialStore', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  function initializedStore(spawnProcess: any, extra: Record<string, unknown> = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-pass-test-'));
    tempDirs.push(dir);
    fs.writeFileSync(path.join(dir, '.gpg-id'), 'test-key\n', { mode: 0o600 });
    const { env: extraEnv, ...rest } = extra;
    return {
      dir,
      store: new PassCredentialStore({
        platform: 'linux',
        executablePath: '/usr/bin/pass',
        env: {
          PASSWORD_STORE_DIR: dir,
          ...((extraEnv as NodeJS.ProcessEnv | undefined) || {}),
        },
        spawnProcess,
        ...rest,
      }),
    };
  }

  it('uses fixed arguments and sends secrets through stdin', async () => {
    const child = fakeChild(0);
    let input = '';
    child.stdin.on('data', (chunk: Buffer) => {
      input += chunk.toString();
    });
    const spawnProcess = vi.fn(() => child);
    const { store } = initializedStore(spawnProcess, {
      env: { REPAIR_API_KEY: 'inherited-secret' },
    });

    await store.set('openai', 'super-secret');

    expect(spawnProcess).toHaveBeenCalledWith(
      '/usr/bin/pass',
      ['insert', '--multiline', '--force', 'repair/openai'],
      expect.objectContaining({ shell: false }),
    );
    expect(JSON.stringify(spawnProcess.mock.calls)).not.toContain('super-secret');
    expect(spawnProcess.mock.calls[0][2].env.REPAIR_API_KEY).toBeUndefined();
    expect(input).toBe('super-secret\n');
  });

  it('handles pass closing stdin before consuming the credential', async () => {
    const child = new EventEmitter() as any;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = vi.fn(() => true);
    child.stdin.end = vi.fn(() => {
      queueMicrotask(() => child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })));
      return child.stdin;
    });
    const { store } = initializedStore(vi.fn(() => child));

    await expect(store.set('openai', 'super-secret')).rejects.toMatchObject({
      code: 'backend-failure',
      message: 'Could not send input to pass.',
    });
  });

  it('retrieves provider-scoped credentials', async () => {
    const spawnProcess = vi.fn(() => fakeChild(0, 'stored-secret\n'));
    const { dir, store } = initializedStore(spawnProcess);
    fs.mkdirSync(path.join(dir, 'repair'), { mode: 0o700 });
    fs.writeFileSync(path.join(dir, 'repair', 'anthropic.gpg'), 'encrypted', {
      mode: 0o600,
    });

    await expect(store.get('anthropic')).resolves.toBe('stored-secret');
    expect(spawnProcess.mock.calls[0][1]).toEqual(['show', 'repair/anthropic']);
  });

  it('rejects a password store that is writable by other users', async () => {
    const { dir, store } = initializedStore(vi.fn());
    fs.chmodSync(dir, 0o770);

    await expect(store.preflight()).rejects.toMatchObject({
      code: 'backend-failure',
      message: expect.stringContaining(`chmod go-w -- '${dir}'`),
    });
  });

  it('reports every writable password-store path component in one actionable error', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-pass-permissions-test-'));
    tempDirs.push(parent);
    const intermediate = path.join(parent, 'shared');
    const storeDir = path.join(intermediate, 'pass');
    fs.mkdirSync(storeDir, { recursive: true, mode: 0o770 });
    fs.chmodSync(intermediate, 0o770);
    fs.chmodSync(storeDir, 0o770);
    fs.writeFileSync(path.join(storeDir, '.gpg-id'), 'test-key\n', { mode: 0o600 });
    const store = new PassCredentialStore({
      platform: 'linux',
      executablePath: '/usr/bin/pass',
      env: { PASSWORD_STORE_DIR: storeDir },
      spawnProcess: vi.fn(),
    });

    await expect(store.preflight()).rejects.toMatchObject({
      code: 'backend-failure',
      message: expect.stringContaining(`chmod go-w -- '${storeDir}' '${intermediate}'`),
    });
  });

  it('rejects a password store not owned by the current user', async () => {
    const uid = process.getuid?.() ?? 1000;
    const { store } = initializedStore(vi.fn(), { uid: uid + 1 });

    await expect(store.preflight()).rejects.toMatchObject({
      code: 'backend-failure',
    });
  });

  it('rejects symlinked password-store paths', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-pass-link-test-'));
    tempDirs.push(parent);
    const target = path.join(parent, 'target');
    const link = path.join(parent, 'store');
    fs.mkdirSync(target, { mode: 0o700 });
    fs.writeFileSync(path.join(target, '.gpg-id'), 'test-key\n', {
      mode: 0o600,
    });
    fs.symlinkSync(target, link);
    const store = new PassCredentialStore({
      platform: 'linux',
      executablePath: '/usr/bin/pass',
      env: { PASSWORD_STORE_DIR: link },
      spawnProcess: vi.fn(),
    });

    await expect(store.preflight()).rejects.toMatchObject({
      code: 'backend-failure',
    });
  });

  it('rejects a writable recipient configuration', async () => {
    const { dir, store } = initializedStore(vi.fn());
    fs.chmodSync(path.join(dir, '.gpg-id'), 0o666);

    await expect(store.preflight()).rejects.toMatchObject({
      code: 'backend-failure',
    });
  });

  it('classifies cancellation without exposing stderr', async () => {
    const spawnProcess = vi.fn(() => fakeChild(2, '', 'gpg: Operation cancelled SECRET'));
    const { dir, store } = initializedStore(spawnProcess);
    fs.mkdirSync(path.join(dir, 'repair'), { mode: 0o700 });
    fs.writeFileSync(path.join(dir, 'repair', 'google.gpg'), 'encrypted', {
      mode: 0o600,
    });

    const error = await store.get('google').catch((value) => value);
    expect(error).toBeInstanceOf(CredentialError);
    expect(error.code).toBe('cancelled');
    expect(error.message).not.toContain('SECRET');
  });

  it('bounds subprocess output', async () => {
    const spawnProcess = vi.fn(() => fakeChild(2, '', 'x'.repeat(100)));
    const { store } = initializedStore(spawnProcess, { maxOutputBytes: 8 });

    await expect(store.set('openrouter', 'secret')).rejects.toMatchObject({
      code: 'backend-failure',
    });
  });

  it('times out even when a blocked subprocess never closes', async () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as any;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = vi.fn(() => true);
    const spawnProcess = vi.fn(() => child);
    const { store } = initializedStore(spawnProcess, { timeoutMs: 10 });
    const result = store.set('openai', 'secret');
    const assertion = expect(result).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(11);

    await assertion;
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    await vi.advanceTimersByTimeAsync(500);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    vi.useRealTimers();
  });
});

describe('CredentialResolver', () => {
  it('prefers a nonblank environment credential without reading the store', async () => {
    const store = {
      backend: testBackend,
      get: vi.fn(),
      preflight: vi.fn(),
      exists: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    };
    const resolver = new CredentialResolver(store, {
      REPAIR_API_KEY: 'env-key',
    });

    await expect(resolver.resolve('openai')).resolves.toEqual({
      source: 'env',
      value: 'env-key',
    });
    expect(store.get).not.toHaveBeenCalled();
  });

  it('falls through blank environment values and isolates providers', async () => {
    const store = {
      backend: testBackend,
      get: vi.fn().mockResolvedValue('pass-key'),
      preflight: vi.fn(),
      exists: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    };
    const resolver = new CredentialResolver(store, { REPAIR_API_KEY: '   ' });

    await expect(resolver.resolve('anthropic')).resolves.toEqual({
      source: 'secure-store',
      value: 'pass-key',
      backend: testBackend,
    });
    expect(store.get).toHaveBeenCalledWith('anthropic');
  });

  it('does not inspect credentials for local providers', async () => {
    const store = {
      backend: testBackend,
      get: vi.fn(),
      preflight: vi.fn(),
      exists: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    };
    const resolver = new CredentialResolver(store, {
      REPAIR_API_KEY: 'env-key',
    });
    await expect(resolver.resolve('local')).resolves.toBeNull();
    expect(store.get).not.toHaveBeenCalled();
  });

  it('reports secure-store status without decrypting the credential', async () => {
    const store = {
      backend: testBackend,
      get: vi.fn(),
      preflight: vi.fn(),
      exists: vi.fn().mockResolvedValue(true),
      set: vi.fn(),
      remove: vi.fn(),
    };
    const resolver = new CredentialResolver(store, {});

    await expect(resolver.status('openai')).resolves.toEqual({
      source: 'secure-store',
      backend: testBackend,
    });
    expect(store.preflight).toHaveBeenCalled();
    expect(store.exists).toHaveBeenCalledWith('openai');
    expect(store.get).not.toHaveBeenCalled();
  });

  it('selects pass only for Linux and explicit unavailable stores elsewhere', async () => {
    expect(createCredentialStore({ platform: 'linux' })).toBeInstanceOf(PassCredentialStore);

    const macStore = createCredentialStore({ platform: 'darwin' });
    expect(macStore.backend.displayName).toBe('macOS Keychain');
    await expect(macStore.preflight()).rejects.toMatchObject({
      code: 'backend-unavailable',
    });

    const windowsStore = createCredentialStore({ platform: 'win32' });
    expect(windowsStore.backend.displayName).toBe('Windows Credential Manager');
    await expect(windowsStore.preflight()).rejects.toMatchObject({
      code: 'backend-unavailable',
    });
  });
});
