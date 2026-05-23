import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CacheManager } from './index';

describe('CacheManager', () => {
  let tempDir: string;
  let cacheDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-cache-test-'));
    cacheDir = path.join(tempDir, 'cache-home');
    process.env.XDG_CACHE_HOME = cacheDir;
  });

  afterEach(() => {
    delete process.env.XDG_CACHE_HOME;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes cache entries with private file permissions', async () => {
    const cache = new CacheManager(60_000);
    await cache.set(
      {
        command: 'npm test',
        output: 'Error: boom',
        shellContext: { exitCode: 1, shell: 'zsh' },
      },
      {
        explanation: 'Bad test',
        directFixes: ['npm install'],
        debugSteps: [],
      },
    );

    const repairCacheDir = path.join(cacheDir, 'repair');
    const [entry] = fs.readdirSync(repairCacheDir);
    const cachePath = path.join(repairCacheDir, entry);

    expect(fs.statSync(repairCacheDir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(cachePath).mode & 0o777).toBe(0o600);
  });

  it('distinguishes cache entries by capture metadata', async () => {
    const cache = new CacheManager(60_000);

    await cache.set(
      {
        command: 'npm test',
        output: 'Error: boom',
        shellContext: { exitCode: 1, shell: 'zsh' },
        captureMetadata: { truncated: false, redactionsApplied: 0 },
      },
      {
        explanation: 'Bad test',
        directFixes: ['npm install'],
        debugSteps: [],
      },
    );

    await cache.set(
      {
        command: 'npm test',
        output: 'Error: boom',
        shellContext: { exitCode: 1, shell: 'zsh' },
        captureMetadata: { truncated: true, redactionsApplied: 3 },
      },
      {
        explanation: 'Truncated output',
        directFixes: [],
        debugSteps: ['npm install'],
      },
    );

    const repairCacheDir = path.join(cacheDir, 'repair');

    expect(fs.readdirSync(repairCacheDir)).toHaveLength(2);
  });
});
