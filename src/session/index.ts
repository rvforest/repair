import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AnalysisRequest, CapturedSession, SessionWriteInput } from '../types';

export type SessionErrorCode = 'missing' | 'invalid';

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

  constructor(stateBaseDir?: string) {
    const stateDir = stateBaseDir || process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
    this.sessionPath = path.join(stateDir, 'repair', 'last-session.json');
  }

  getSessionPath(): string {
    return this.sessionPath;
  }

  hasSessionFile(): boolean {
    return fs.existsSync(this.sessionPath);
  }

  async read(): Promise<CapturedSession> {
    if (!this.hasSessionFile()) {
      throw new SessionError('missing', `No captured session found at ${this.sessionPath}`);
    }

    try {
      const raw = fs.readFileSync(this.sessionPath, 'utf-8');
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

  async write(input: SessionWriteInput): Promise<CapturedSession> {
    const session = this.validate(input);
    const sessionDir = path.dirname(this.sessionPath);

    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    fs.writeFileSync(this.sessionPath, JSON.stringify(session, null, 2), 'utf-8');
    return session;
  }

  toAnalysisRequest(session: CapturedSession): AnalysisRequest {
    return {
      command: session.command,
      output: session.output,
      shellContext: {
        cwd: session.cwd,
        shell: session.shell,
        exitCode: session.exitCode,
        timestamp: session.timestamp,
      },
    };
  }

  private validate(value: unknown): CapturedSession {
    if (!value || typeof value !== 'object') {
      throw new SessionError('invalid', 'Captured session payload must be an object');
    }

    const payload = value as Partial<CapturedSession>;

    if (!payload.command || typeof payload.command !== 'string') {
      throw new SessionError('invalid', 'Captured session command is required');
    }

    if (typeof payload.output !== 'string') {
      throw new SessionError('invalid', 'Captured session output is required');
    }

    if (!Number.isInteger(payload.exitCode)) {
      throw new SessionError('invalid', 'Captured session exit code must be an integer');
    }

    const exitCode = payload.exitCode as number;

    if (!payload.timestamp || typeof payload.timestamp !== 'string' || Number.isNaN(Date.parse(payload.timestamp))) {
      throw new SessionError('invalid', 'Captured session timestamp must be a valid ISO date');
    }

    return {
      command: payload.command,
      output: payload.output,
      exitCode,
      timestamp: payload.timestamp,
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