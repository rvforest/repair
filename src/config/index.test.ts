import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from './index';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let tempDir: string;
  let testConfigPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-config-test-'));
    process.env.XDG_CONFIG_HOME = tempDir;
    configManager = new ConfigManager();
    const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    testConfigPath = path.join(configDir, 'repair', 'config.json');

    // Clean up any existing test config
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  afterEach(() => {
    // Clean up test config
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }

    // Clean up environment variables
    delete process.env.REPAIR_API_KEY;
    delete process.env.REPAIR_PROVIDER;
    delete process.env.REPAIR_MODEL;
    delete process.env.REPAIR_INCLUDE_CWD;
    delete process.env.REPAIR_MAX_CAPTURE_BYTES;
    delete process.env.REPAIR_MAX_PERSISTED_OUTPUT_BYTES;
    delete process.env.XDG_CONFIG_HOME;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('validate', () => {
    it('should accept valid config', () => {
      const config = {
        provider: 'openai' as const,
        apiKey: 'test-key',
        scrollbackLines: 100,
        cacheEnabled: true,
        cacheTTL: 86400000,
        confirmBeforeSend: false,
      };

      expect(() => configManager.validate(config)).not.toThrow();
    });

    it('should reject invalid provider', () => {
      const config = {
        provider: 'invalid' as any,
        apiKey: 'test-key',
        scrollbackLines: 100,
        cacheEnabled: true,
        cacheTTL: 86400000,
        confirmBeforeSend: false,
      };

      expect(() => configManager.validate(config)).toThrow('Invalid provider');
    });

    it('should reject missing API key for non-local providers', () => {
      const config = {
        provider: 'openai' as const,
        scrollbackLines: 100,
        cacheEnabled: true,
        cacheTTL: 86400000,
        confirmBeforeSend: false,
      };

      expect(() => configManager.validate(config)).toThrow('API key is required');
    });

    it('should allow api-key-free validation for capture-time config', () => {
      const config = {
        provider: 'openai' as const,
        includeCwd: false,
      };

      expect(() => configManager.validate(config, { requireApiKey: false })).not.toThrow();
    });

    it('should reject invalid scrollbackLines', () => {
      const config = {
        provider: 'openai' as const,
        apiKey: 'test-key',
        scrollbackLines: 5000,
        cacheEnabled: true,
        cacheTTL: 86400000,
        confirmBeforeSend: false,
      };

      expect(() => configManager.validate(config)).toThrow('scrollbackLines must be between');
    });
  });

  describe('load', () => {
    it('should load non-secret settings from environment variables', async () => {
      process.env.REPAIR_PROVIDER = 'anthropic';

      const config = await configManager.load();

      expect(config.apiKey).toBeUndefined();
      expect(config.provider).toBe('anthropic');
    });

    it('does not resolve credentials during config loading', async () => {
      await expect(configManager.load()).resolves.toMatchObject({
        provider: 'openai',
      });
    });

    it('loads capture-related config without requiring an API key', async () => {
      process.env.REPAIR_INCLUDE_CWD = 'true';
      process.env.REPAIR_MAX_CAPTURE_BYTES = '8192';

      const config = await configManager.load({ requireApiKey: false });

      expect(config.includeCwd).toBe(true);
      expect(config.maxCaptureBytes).toBe(8192);
    });
  });

  describe('save', () => {
    it('writes config with private file permissions', async () => {
      await configManager.save({ provider: 'local', model: 'llama3' });

      const configDir = path.dirname(testConfigPath);
      expect(fs.statSync(configDir).mode & 0o777).toBe(0o700);
      expect(fs.statSync(testConfigPath).mode & 0o777).toBe(0o600);
    });

    it('rejects attempts to save plaintext API keys', async () => {
      await expect(configManager.save({ apiKey: 'never-write-this' })).rejects.toThrow('Refusing to save apiKey');
      expect(fs.existsSync(testConfigPath)).toBe(false);
    });

    it('removes legacy plaintext keys when saving non-secret settings', async () => {
      fs.mkdirSync(path.dirname(testConfigPath), { recursive: true });
      fs.writeFileSync(testConfigPath, JSON.stringify({ provider: 'openai', apiKey: 'legacy' }));
      await configManager.save({ model: 'gpt-test' });
      expect(JSON.parse(fs.readFileSync(testConfigPath, 'utf8'))).toEqual({
        provider: 'openai',
        model: 'gpt-test',
      });
    });
  });

  it('rejects legacy plaintext keys for credential-requiring loads without displaying them', async () => {
    fs.mkdirSync(path.dirname(testConfigPath), { recursive: true });
    fs.writeFileSync(testConfigPath, JSON.stringify({ provider: 'openai', apiKey: 'legacy-secret' }));
    const error = await configManager.load().catch((value) => value as Error);
    expect(error.message).toContain('Plaintext apiKey');
    expect(error.message).not.toContain('legacy-secret');
  });

  it('ignores legacy plaintext keys during capture-time loading', async () => {
    fs.mkdirSync(path.dirname(testConfigPath), { recursive: true });
    fs.writeFileSync(testConfigPath, JSON.stringify({ provider: 'openai', apiKey: 'legacy-secret' }));
    const config = await configManager.load({ requireApiKey: false });
    expect(config.apiKey).toBeUndefined();
  });
});
