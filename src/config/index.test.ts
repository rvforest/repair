import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from './index';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let testConfigPath: string;

  beforeEach(() => {
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
    it('should load from environment variables', async () => {
      process.env.REPAIR_API_KEY = 'env-key';
      process.env.REPAIR_PROVIDER = 'anthropic';

      const config = await configManager.load();

      expect(config.apiKey).toBe('env-key');
      expect(config.provider).toBe('anthropic');
    });

    it('should throw error when no API key is configured', async () => {
      await expect(configManager.load()).rejects.toThrow('No API key configured');
    });
  });
});
