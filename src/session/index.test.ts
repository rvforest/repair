import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { normalizeTimestamp, SessionError, SessionStore } from './index';

describe('SessionStore', () => {
  let tempDir: string;
  let store: SessionStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-session-test-'));
    store = new SessionStore(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes and reads the last captured session', async () => {
    await store.write({
      command: 'npm test',
      output: 'Error: boom',
      exitCode: 1,
      timestamp: '2026-04-01T12:00:00.000Z',
      cwd: '/tmp/project',
      shell: 'zsh',
    });

    const session = await store.read();

    expect(session).toEqual({
      command: 'npm test',
      output: 'Error: boom',
      exitCode: 1,
      timestamp: '2026-04-01T12:00:00.000Z',
      cwd: '/tmp/project',
      shell: 'zsh',
      truncated: false,
      redactionsApplied: 0,
    });
  });

  it('clears previously stored failure state after a successful command', async () => {
    await store.write({
      command: 'npm test',
      output: 'Error: boom',
      exitCode: 1,
      timestamp: '2026-04-01T12:00:00.000Z',
      shell: 'zsh',
    });

    await store.capture({
      command: 'npm test',
      output: 'all good',
      exitCode: 0,
      timestamp: '2026-04-01T12:01:00.000Z',
      shell: 'zsh',
    });

    await expect(store.read()).rejects.toMatchObject<Partial<SessionError>>({
      code: 'missing',
    });
  });

  it('rejects oversized or symlinked session files', async () => {
    const sessionPath = store.getSessionPath();
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    fs.writeFileSync(sessionPath, JSON.stringify({
      command: 'npm test',
      output: 'x'.repeat(140 * 1024),
      exitCode: 1,
      timestamp: '2026-04-01T12:00:00.000Z',
      truncated: false,
      redactionsApplied: 0,
    }), 'utf-8');

    await expect(store.read()).rejects.toMatchObject<Partial<SessionError>>({ code: 'invalid' });

    fs.rmSync(sessionPath, { force: true });
    fs.symlinkSync(path.join(tempDir, 'other.json'), sessionPath);
    await expect(store.read()).rejects.toMatchObject<Partial<SessionError>>({ code: 'invalid' });
  });

  it('writes state with private file permissions', async () => {
    await store.write({
      command: 'npm test',
      output: 'Error: boom',
      exitCode: 1,
      timestamp: '2026-04-01T12:00:00.000Z',
      shell: 'zsh',
    });

    const sessionPath = store.getSessionPath();
    const sessionDir = path.dirname(sessionPath);

    expect(fs.statSync(sessionDir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(sessionPath).mode & 0o777).toBe(0o600);
  });

  it('rejects invalid session payloads', async () => {
    const sessionPath = store.getSessionPath();
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    fs.writeFileSync(sessionPath, JSON.stringify({ command: 'npm test' }), 'utf-8');

    await expect(store.read()).rejects.toMatchObject<Partial<SessionError>>({
      code: 'invalid',
    });
  });

  it('reports missing state files', async () => {
    await expect(store.read()).rejects.toMatchObject<Partial<SessionError>>({
      code: 'missing',
    });
  });
});

describe('normalizeTimestamp', () => {
  it('converts epoch seconds to ISO timestamps', () => {
    expect(normalizeTimestamp('1711963200')).toBe('2024-04-01T09:20:00.000Z');
  });

  it('accepts ISO timestamps', () => {
    expect(normalizeTimestamp('2026-04-01T12:00:00.000Z')).toBe('2026-04-01T12:00:00.000Z');
  });
});