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
    });
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