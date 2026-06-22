import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LLM_PROVIDERS, LLMProvider, RemoteLLMProvider } from '../types';

export const REMOTE_PROVIDERS: readonly RemoteLLMProvider[] = LLM_PROVIDERS.filter(
  (provider): provider is RemoteLLMProvider => provider !== 'local',
);

export type CredentialSource = 'env' | 'secure-store' | 'missing' | 'unavailable';
export type CredentialErrorCode =
  | 'missing'
  | 'backend-unavailable'
  | 'backend-uninitialized'
  | 'cancelled'
  | 'timeout'
  | 'backend-failure';

export interface ResolvedCredential {
  source: 'env' | 'secure-store';
  value: string;
  backend?: CredentialBackend;
}

export interface CredentialStatus {
  source: CredentialSource;
  maskedValue?: string;
  errorCode?: CredentialErrorCode;
  backend?: CredentialBackend;
}

export interface CredentialBackend {
  id: string;
  displayName: string;
  setupHint?: string;
}

export class CredentialError extends Error {
  constructor(
    public readonly code: CredentialErrorCode,
    message: string,
    public readonly backend?: CredentialBackend,
  ) {
    super(message);
    this.name = 'CredentialError';
  }
}

export interface CredentialStore {
  readonly backend: CredentialBackend;
  preflight(): Promise<void>;
  exists(provider: LLMProvider): Promise<boolean>;
  get(provider: LLMProvider): Promise<string | null>;
  set(provider: LLMProvider, value: string): Promise<void>;
  remove(provider: LLMProvider): Promise<boolean>;
}

export interface CredentialResolverLike {
  resolve(provider: LLMProvider): Promise<ResolvedCredential | null>;
  status(provider: LLMProvider): Promise<CredentialStatus>;
}

export interface CredentialStoreFactoryOptions {
  platform?: NodeJS.Platform;
  passOptions?: PassCredentialStoreOptions;
}

export function validateRemoteProvider(provider: string): RemoteLLMProvider {
  if (!REMOTE_PROVIDERS.includes(provider as RemoteLLMProvider)) {
    throw new Error(`Invalid remote provider: ${provider}. Valid providers are: ${REMOTE_PROVIDERS.join(', ')}`);
  }
  return provider as RemoteLLMProvider;
}

export function maskCredential(value: string): string {
  if (value.length < 12) {
    return '*'.repeat(value.length);
  }
  return `******${value.slice(-4)}`;
}

export function credentialErrorMessage(
  error: CredentialError,
  provider: LLMProvider,
  backend?: CredentialBackend,
): string {
  const fallback = `Set REPAIR_API_KEY for non-interactive use.`;
  switch (error.code) {
    case 'backend-unavailable':
      return `${backend?.displayName || 'Secure credential storage'} is unavailable for ${provider}. ${fallback}`;
    case 'backend-uninitialized':
      return `${error.message} ${backend?.setupHint || fallback}`;
    case 'cancelled':
      return `Secure credential access was cancelled. Retry, or ${fallback.toLowerCase()}`;
    case 'timeout':
      return `Secure credential access timed out. Retry, or ${fallback.toLowerCase()}`;
    case 'backend-failure':
      return `Secure credential storage failed for ${provider}. ${fallback}`;
    case 'missing':
    default:
      return missingCredentialMessage(provider);
  }
}

export function missingCredentialMessage(provider: LLMProvider): string {
  return (
    `No API credential is configured for ${provider}.\n` +
    `For interactive use with a supported secure store, run: repair auth set ${provider}\n` +
    `For non-interactive use, set REPAIR_API_KEY.`
  );
}

interface ProcessResult {
  stdout: Buffer;
  stderr: Buffer;
  code: number;
}

type SpawnProcess = (
  command: string,
  args: readonly string[],
  options: {
    env: NodeJS.ProcessEnv;
    shell: false;
    stdio: ['pipe', 'pipe', 'pipe'];
  },
) => ChildProcessWithoutNullStreams;

export interface PassCredentialStoreOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homedir?: string;
  uid?: number;
  executablePath?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  spawnProcess?: SpawnProcess;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;

export class PassCredentialStore implements CredentialStore {
  readonly backend: CredentialBackend = {
    id: 'pass',
    displayName: 'pass password store',
    setupHint: 'Initialize pass independently, or set REPAIR_API_KEY.',
  };
  private readonly env: NodeJS.ProcessEnv;
  private readonly platform: NodeJS.Platform;
  private readonly homedir: string;
  private readonly uid?: number;
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly spawnProcess: SpawnProcess;
  private executablePath?: string;

  constructor(options: PassCredentialStoreOptions = {}) {
    this.env = options.env || process.env;
    this.platform = options.platform || process.platform;
    this.homedir = options.homedir || os.homedir();
    this.uid = options.uid ?? process.getuid?.();
    this.executablePath = options.executablePath;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.maxOutputBytes = options.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES;
    this.spawnProcess = options.spawnProcess || ((command, args, spawnOptions) => spawn(command, args, spawnOptions));
  }

  get storeDir(): string {
    return path.resolve(this.env.PASSWORD_STORE_DIR || path.join(this.homedir, '.password-store'));
  }

  async preflight(): Promise<void> {
    if (this.platform !== 'linux') {
      throw new CredentialError(
        'backend-unavailable',
        'The pass credential backend is supported only on Linux and WSL.',
      );
    }

    this.executablePath = this.executablePath || findExecutable('pass', this.env.PATH);
    if (!this.executablePath) {
      throw new CredentialError('backend-unavailable', 'The pass executable was not found.');
    }

    try {
      this.validateStoreDirectory();
      this.validateOwnedFile(path.join(this.storeDir, '.gpg-id'), true);
    } catch (error) {
      if (error instanceof CredentialError) throw error;
      throw new CredentialError('backend-uninitialized', 'The pass password store is not initialized.');
    }
  }

  async exists(provider: LLMProvider): Promise<boolean> {
    const entryPath = this.entryFile(provider);
    try {
      const entryDir = path.dirname(entryPath);
      if (fs.existsSync(entryDir)) {
        this.validateOwnedDirectory(entryDir);
      }
      this.validateOwnedFile(entryPath);
      return true;
    } catch (error) {
      if (isMissingFileError(error)) return false;
      if (error instanceof CredentialError) throw error;
      throw new CredentialError('backend-failure', 'Could not inspect the credential entry.');
    }
  }

  async get(provider: LLMProvider): Promise<string | null> {
    await this.preflight();
    if (!(await this.exists(provider))) {
      return null;
    }
    const result = await this.run(['show', this.entryName(provider)]);
    return result.stdout.toString('utf8').replace(/\r?\n$/, '');
  }

  async set(provider: LLMProvider, value: string): Promise<void> {
    await this.preflight();
    await this.run(['insert', '--multiline', '--force', this.entryName(provider)], Buffer.from(`${value}\n`, 'utf8'));
  }

  async remove(provider: LLMProvider): Promise<boolean> {
    await this.preflight();
    if (!(await this.exists(provider))) {
      return false;
    }
    await this.run(['rm', '--force', this.entryName(provider)]);
    return true;
  }

  private entryName(provider: LLMProvider): string {
    return `repair/${validateRemoteProvider(provider)}`;
  }

  private entryFile(provider: LLMProvider): string {
    return path.join(this.storeDir, 'repair', `${validateRemoteProvider(provider)}.gpg`);
  }

  private validateStoreDirectory(): void {
    const storeDir = this.storeDir;
    const pathComponents: string[] = [];
    let current = storeDir;

    pathComponents.push(current);
    while (path.dirname(current) !== current) {
      current = path.dirname(current);
      pathComponents.push(current);
    }

    for (const component of pathComponents) {
      current = component;
      const stats = fs.lstatSync(current);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new CredentialError('backend-failure', 'Password store path is not a trusted directory.');
      }

      const isStoreRoot = current === storeDir;
      const isSharedStickyAncestor = !isStoreRoot && (stats.mode & 0o1000) !== 0;
      if ((stats.mode & 0o022) !== 0 && !isSharedStickyAncestor) {
        throw new CredentialError('backend-failure', 'Password store path is writable by other users.');
      }
      if (isStoreRoot && this.uid !== undefined && stats.uid !== this.uid) {
        throw new CredentialError('backend-failure', 'Password store is not owned by the current user.');
      }
    }
  }

  private validateOwnedDirectory(dirPath: string): void {
    const stats = fs.lstatSync(dirPath);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new CredentialError('backend-failure', 'Credential directory is not a trusted directory.');
    }
    if (this.uid !== undefined && stats.uid !== this.uid) {
      throw new CredentialError('backend-failure', 'Credential directory is not owned by the current user.');
    }
    if ((stats.mode & 0o022) !== 0) {
      throw new CredentialError('backend-failure', 'Credential directory is writable by other users.');
    }
  }

  private validateOwnedFile(filePath: string, requireNonempty: boolean = false): void {
    const stats = fs.lstatSync(filePath);
    if (stats.isSymbolicLink() || !stats.isFile() || (requireNonempty && stats.size === 0)) {
      throw new CredentialError('backend-failure', 'Credential file is not a trusted regular file.');
    }
    if (this.uid !== undefined && stats.uid !== this.uid) {
      throw new CredentialError('backend-failure', 'Credential file is not owned by the current user.');
    }
    if ((stats.mode & 0o022) !== 0) {
      throw new CredentialError('backend-failure', 'Credential file is writable by other users.');
    }
  }

  private async run(args: readonly string[], stdin?: Buffer): Promise<ProcessResult> {
    if (!this.executablePath) {
      throw new CredentialError('backend-unavailable', 'The pass executable was not found.');
    }
    const executablePath = this.executablePath;
    const childEnv = { ...this.env };
    delete childEnv.REPAIR_API_KEY;

    return new Promise<ProcessResult>((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams;
      try {
        child = this.spawnProcess(executablePath, args, {
          env: childEnv,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        reject(new CredentialError('backend-unavailable', 'Could not start pass.'));
        return;
      }

      let stdout: Buffer = Buffer.alloc(0);
      let stderr: Buffer = Buffer.alloc(0);
      let outputExceeded = false;
      let timedOut = false;
      let forceTimer: NodeJS.Timeout | undefined;

      const append = (current: Buffer, chunk: Buffer): Buffer => {
        const remaining = this.maxOutputBytes - current.length;
        if (remaining <= 0) {
          outputExceeded = true;
          return current;
        }
        if (chunk.length > remaining) {
          outputExceeded = true;
          return Buffer.concat([current, chunk.subarray(0, remaining)]);
        }
        return Buffer.concat([current, chunk]);
      };

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = append(stdout, Buffer.from(chunk));
        if (outputExceeded) child.kill('SIGTERM');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = append(stderr, Buffer.from(chunk));
        if (outputExceeded) child.kill('SIGTERM');
      });

      child.stdin.on('error', () => {
        clearTimeout(timer);
        if (forceTimer) clearTimeout(forceTimer);
        if (timedOut) return;
        reject(new CredentialError('backend-failure', 'Could not send input to pass.'));
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        forceTimer = setTimeout(() => child.kill('SIGKILL'), 500);
        forceTimer.unref();
        reject(new CredentialError('timeout', 'pass operation timed out.'));
      }, this.timeoutMs);
      timer.unref();

      child.on('error', () => {
        clearTimeout(timer);
        if (forceTimer) clearTimeout(forceTimer);
        if (timedOut) return;
        reject(new CredentialError('backend-unavailable', 'Could not start pass.'));
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (forceTimer) clearTimeout(forceTimer);
        if (timedOut) return;
        if (outputExceeded) {
          reject(new CredentialError('backend-failure', 'pass output exceeded the safety limit.'));
          return;
        }
        if (code === 0) {
          resolve({ stdout, stderr, code: 0 });
          return;
        }
        reject(classifyPassFailure(stderr.toString('utf8')));
      });

      if (stdin) {
        child.stdin.end(stdin);
      } else {
        child.stdin.end();
      }
    });
  }
}

class UnsupportedCredentialStore implements CredentialStore {
  readonly backend: CredentialBackend;

  constructor(platform: NodeJS.Platform) {
    const platformName =
      platform === 'darwin' ? 'macOS Keychain' : platform === 'win32' ? 'Windows Credential Manager' : platform;
    this.backend = {
      id: `unsupported-${platform}`,
      displayName: platformName,
      setupHint: `Native ${platformName} support is not available yet. Set REPAIR_API_KEY.`,
    };
  }

  async preflight(): Promise<void> {
    throw new CredentialError('backend-unavailable', `${this.backend.displayName} support is not available yet.`);
  }

  async exists(provider: LLMProvider): Promise<boolean> {
    void provider;
    await this.preflight();
    return false;
  }

  async get(provider: LLMProvider): Promise<string | null> {
    void provider;
    await this.preflight();
    return null;
  }

  async set(provider: LLMProvider, value: string): Promise<void> {
    void provider;
    void value;
    await this.preflight();
  }

  async remove(provider: LLMProvider): Promise<boolean> {
    void provider;
    await this.preflight();
    return false;
  }
}

export function createCredentialStore(options: CredentialStoreFactoryOptions = {}): CredentialStore {
  const platform = options.platform || process.platform;
  if (platform === 'linux') {
    return new PassCredentialStore({
      ...options.passOptions,
      platform,
    });
  }
  return new UnsupportedCredentialStore(platform);
}

export class CredentialResolver implements CredentialResolverLike {
  constructor(
    private readonly store: CredentialStore = createCredentialStore(),
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async resolve(provider: LLMProvider): Promise<ResolvedCredential | null> {
    if (provider === 'local') {
      return null;
    }
    validateRemoteProvider(provider);
    const envValue = this.env.REPAIR_API_KEY;
    if (envValue && envValue.trim()) {
      return { source: 'env', value: envValue };
    }

    try {
      const value = await this.store.get(provider);
      if (value !== null && value.length > 0) {
        return { source: 'secure-store', value, backend: this.store.backend };
      }
      throw new CredentialError('missing', missingCredentialMessage(provider));
    } catch (error) {
      if (error instanceof CredentialError) {
        throw new CredentialError(error.code, error.message, error.backend || this.store.backend);
      }
      throw new CredentialError('backend-failure', 'Secure credential storage failed.');
    }
  }

  async status(provider: LLMProvider): Promise<CredentialStatus> {
    if (provider === 'local') {
      return { source: 'missing' };
    }
    const envValue = this.env.REPAIR_API_KEY;
    if (envValue && envValue.trim()) {
      return { source: 'env', maskedValue: maskCredential(envValue) };
    }
    try {
      await this.store.preflight();
      return (await this.store.exists(provider))
        ? { source: 'secure-store', backend: this.store.backend }
        : { source: 'missing', errorCode: 'missing' };
    } catch (error) {
      const code = error instanceof CredentialError ? error.code : 'backend-failure';
      return {
        source: 'unavailable',
        errorCode: code,
        backend: this.store.backend,
      };
    }
  }
}

function findExecutable(name: string, pathValue: string | undefined): string | undefined {
  for (const directory of (pathValue || '').split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.resolve(directory, name);
    try {
      const resolved = fs.realpathSync(candidate);
      fs.accessSync(resolved, fs.constants.X_OK);
      if (fs.lstatSync(resolved).isFile()) return resolved;
    } catch {}
  }
  return undefined;
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT',
  );
}

function classifyPassFailure(stderr: string): CredentialError {
  const normalized = stderr.toLowerCase();
  if (
    normalized.includes('cancelled') ||
    normalized.includes('canceled') ||
    normalized.includes('operation cancelled') ||
    normalized.includes('no pinentry')
  ) {
    return new CredentialError('cancelled', 'Secure credential access was cancelled.');
  }
  if (normalized.includes('not in the password store')) {
    return new CredentialError('missing', 'Credential is not in the password store.');
  }
  return new CredentialError('backend-failure', 'The pass operation failed.');
}
