import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SecurityFilter } from '../security';
import { AnalysisRequest, SanitizedSessionBundle, SessionWriteInput } from '../types';
import { pathExists, readTextFileSafe, removeFileIfExists, writeTextFileAtomic } from '../storage';

export type SessionErrorCode = 'missing' | 'invalid';
const MAX_SESSION_FILE_BYTES = 256 * 1024;
const MAX_STRING_FIELD_BYTES = 128 * 1024;

export interface ShellCaptureStatus {
  kind: 'none' | 'success' | 'skipped' | 'captured';
  entrypoint?: string;
}

export class SessionError extends Error {
  constructor(
    public readonly code: SessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

export class SessionStore {
  private readonly sessionPath: string;
  private readonly securityFilter: SecurityFilter;

  constructor(stateBaseDir?: string, securityFilter: SecurityFilter = new SecurityFilter()) {
    const stateDir = stateBaseDir || process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
    this.sessionPath = path.join(stateDir, 'repair', 'last-session.json');
    this.securityFilter = securityFilter;
  }

  getSessionPath(): string {
    return this.sessionPath;
  }

  hasSessionFile(): boolean {
    return pathExists(this.sessionPath);
  }

  async read(): Promise<SanitizedSessionBundle> {
    if (!this.hasSessionFile()) {
      throw new SessionError('missing', `No captured session found at ${this.sessionPath}`);
    }

    try {
      const raw = readTextFileSafe(this.sessionPath, MAX_SESSION_FILE_BYTES);
      return this.validate(JSON.parse(raw));
    } catch (error) {
      if (error instanceof SessionError) {
        throw error;
      }

      throw new SessionError(
        'invalid',
        `Captured session file is invalid: ${this.sessionPath}`,
      );
    }
  }

  async write(input: SessionWriteInput, includeCwd: boolean = true): Promise<SanitizedSessionBundle> {
    const session = this.securityFilter.sanitizeSessionBundle(input, { includeCwd });
    const validated = this.validate(session);
    writeTextFileAtomic(this.sessionPath, JSON.stringify(validated, null, 2));
    return validated;
  }

  async capture(
    input: SessionWriteInput,
    options: { includeCwd?: boolean; stdinWasTruncated?: boolean; maxPersistedOutputBytes?: number } = {},
  ): Promise<SanitizedSessionBundle | null> {
    if (input.exitCode === 0) {
      await this.clear();
      return null;
    }

    const session = this.securityFilter.sanitizeSessionBundle(input, options);
    const validated = this.validate(session);
    writeTextFileAtomic(this.sessionPath, JSON.stringify(validated, null, 2));
    return validated;
  }

  async clear(): Promise<void> {
    removeFileIfExists(this.sessionPath);
  }

  toAnalysisRequest(session: SanitizedSessionBundle, includeCwd: boolean = false): AnalysisRequest {
    return {
      command: session.command,
      output: session.output,
      shellContext: {
        ...(includeCwd && session.cwd ? { cwd: session.cwd } : {}),
        shell: session.shell,
        exitCode: session.exitCode,
        timestamp: session.timestamp,
      },
    };
  }

  private validate(value: unknown): SanitizedSessionBundle {
    if (!value || typeof value !== 'object') {
      throw new SessionError('invalid', 'Captured session payload must be an object');
    }

    const payload = value as Partial<SanitizedSessionBundle>;

    if (!payload.command || typeof payload.command !== 'string') {
      throw new SessionError('invalid', 'Captured session command is required');
    }

    if (Buffer.byteLength(payload.command, 'utf8') > MAX_STRING_FIELD_BYTES) {
      throw new SessionError('invalid', 'Captured session command exceeds the maximum length');
    }

    if (typeof payload.output !== 'string') {
      throw new SessionError('invalid', 'Captured session output is required');
    }

    if (Buffer.byteLength(payload.output, 'utf8') > MAX_STRING_FIELD_BYTES) {
      throw new SessionError('invalid', 'Captured session output exceeds the maximum length');
    }

    if (!Number.isInteger(payload.exitCode)) {
      throw new SessionError('invalid', 'Captured session exit code must be an integer');
    }

    const exitCode = payload.exitCode as number;

    if (!payload.timestamp || typeof payload.timestamp !== 'string' || Number.isNaN(Date.parse(payload.timestamp))) {
      throw new SessionError('invalid', 'Captured session timestamp must be a valid ISO date');
    }

    if (typeof payload.truncated !== 'boolean') {
      throw new SessionError('invalid', 'Captured session truncated flag must be a boolean');
    }

    const redactionsApplied = payload.redactionsApplied;
    if (typeof redactionsApplied !== 'number' || !Number.isInteger(redactionsApplied) || redactionsApplied < 0) {
      throw new SessionError('invalid', 'Captured session redaction count must be a non-negative integer');
    }

    if (payload.cwd && Buffer.byteLength(payload.cwd, 'utf8') > MAX_STRING_FIELD_BYTES) {
      throw new SessionError('invalid', 'Captured session cwd exceeds the maximum length');
    }

    if (payload.shell && Buffer.byteLength(payload.shell, 'utf8') > 256) {
      throw new SessionError('invalid', 'Captured session shell exceeds the maximum length');
    }

    return {
      command: payload.command,
      output: payload.output,
      exitCode,
      timestamp: payload.timestamp,
      truncated: payload.truncated,
      redactionsApplied,
      ...(payload.cwd && { cwd: payload.cwd }),
      ...(payload.shell && { shell: payload.shell }),
    };
  }
}

export function normalizeTimestamp(input: string): string {
  if (!input) {
    return new Date().toISOString();
  }

  if (/^\d+$/.test(input)) {
    const numeric = Number(input);
    const milliseconds = input.length <= 10 ? numeric * 1000 : numeric;
    return new Date(milliseconds).toISOString();
  }

  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) {
    throw new SessionError('invalid', 'Timestamp must be an epoch value or ISO-8601 string');
  }

  return new Date(parsed).toISOString();
}

export function isShellIntegrationConfigured(): boolean {
  return process.env.REPAIR_SHELL_INTEGRATION === '1';
}

export function getShellCaptureStatus(): ShellCaptureStatus {
  const raw = process.env.REPAIR_LAST_CAPTURE_STATUS || 'none';
  if (raw === 'success' || raw === 'captured' || raw === 'none') {
    return { kind: raw };
  }

  if (raw.startsWith('skipped:')) {
    return {
      kind: 'skipped',
      entrypoint: raw.slice('skipped:'.length),
    };
  }

  return { kind: 'none' };
}