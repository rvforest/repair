import * as path from 'path';
import * as os from 'os';
import {
  DEFAULT_MAX_CAPTURE_BYTES,
  DEFAULT_MAX_PERSISTED_OUTPUT_BYTES,
  MAX_ALLOWED_CAPTURE_BYTES,
  MAX_ALLOWED_PERSISTED_OUTPUT_BYTES,
} from '../security';
import { Config, LLMProvider } from '../types';
import { ensurePrivateDirectory, pathExists, readTextFileSafe, writeTextFileAtomic } from '../storage';

const DEFAULT_CONFIG: Config = {
  provider: 'openai',
  scrollbackLines: 100,
  cacheEnabled: true,
  cacheTTL: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  confirmBeforeSend: false,
  includeCwd: false,
  maxCaptureBytes: DEFAULT_MAX_CAPTURE_BYTES,
  maxPersistedOutputBytes: DEFAULT_MAX_PERSISTED_OUTPUT_BYTES,
};

export class ConfigManager {
  private configPath: string;

  constructor() {
    const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    this.configPath = path.join(configDir, 'repair', 'config.json');
  }

  async load(options: { requireApiKey?: boolean } = {}): Promise<Config> {
    // Check environment variables first
    const envProvider = process.env.REPAIR_PROVIDER as LLMProvider;
    const envApiKey = process.env.REPAIR_API_KEY;
    const envModel = process.env.REPAIR_MODEL;
    const envIncludeCwd = process.env.REPAIR_INCLUDE_CWD;
    const envMaxCaptureBytes = process.env.REPAIR_MAX_CAPTURE_BYTES;
    const envMaxPersistedOutputBytes = process.env.REPAIR_MAX_PERSISTED_OUTPUT_BYTES;

    // Try to load from config file
    let fileConfig: Partial<Config> = {};
    if (pathExists(this.configPath)) {
      try {
        const fileContent = readTextFileSafe(this.configPath, 128 * 1024);
        fileConfig = JSON.parse(fileContent);
      } catch (error) {
        console.warn(`Warning: Could not parse config file at ${this.configPath}`);
      }
    }

    // Merge configs: env vars > file config > defaults
    const config: Config = {
      ...DEFAULT_CONFIG,
      ...fileConfig,
      ...(envProvider && { provider: envProvider }),
      ...(envApiKey && { apiKey: envApiKey }),
      ...(envModel && { model: envModel }),
      ...(envIncludeCwd !== undefined && { includeCwd: envIncludeCwd === '1' || envIncludeCwd === 'true' }),
      ...(envMaxCaptureBytes && { maxCaptureBytes: Number(envMaxCaptureBytes) }),
      ...(envMaxPersistedOutputBytes && { maxPersistedOutputBytes: Number(envMaxPersistedOutputBytes) }),
    };

    // If no API key is found, prompt user to configure
    if (options.requireApiKey !== false && !config.apiKey) {
      throw new Error(
        'No API key configured. Please set REPAIR_API_KEY environment variable or run setup:\n' +
        'export REPAIR_API_KEY=your-api-key-here\n' +
        'Or create a config file at: ' + this.configPath
      );
    }

    return config;
  }

  async save(config: Partial<Config>): Promise<void> {
    const configDir = path.dirname(this.configPath);

    // Create config directory if it doesn't exist
    ensurePrivateDirectory(configDir);

    // Load existing config if it exists
    let existingConfig: Partial<Config> = {};
    if (pathExists(this.configPath)) {
      try {
        const fileContent = readTextFileSafe(this.configPath, 128 * 1024);
        existingConfig = JSON.parse(fileContent);
      } catch (error) {
        // Ignore parse errors, will overwrite
      }
    }

    // Merge and save
    const mergedConfig = { ...existingConfig, ...config };
    writeTextFileAtomic(this.configPath, JSON.stringify(mergedConfig, null, 2));
  }

  validate(config: Config, options: { requireApiKey?: boolean } = {}): void {
    const validProviders: LLMProvider[] = ['openai', 'anthropic', 'google', 'openrouter', 'local'];

    if (!validProviders.includes(config.provider)) {
      throw new Error(
        `Invalid provider: ${config.provider}. Valid providers are: ${validProviders.join(', ')}`
      );
    }

    if (options.requireApiKey !== false && !config.apiKey && config.provider !== 'local') {
      throw new Error(`API key is required for provider: ${config.provider}`);
    }

    if (config.scrollbackLines && (config.scrollbackLines < 10 || config.scrollbackLines > 1000)) {
      throw new Error('scrollbackLines must be between 10 and 1000');
    }

    if (config.maxTokens && config.maxTokens < 100) {
      throw new Error('maxTokens must be at least 100');
    }

    if (config.includeCwd !== undefined && typeof config.includeCwd !== 'boolean') {
      throw new Error('includeCwd must be a boolean');
    }

    if (
      config.maxCaptureBytes !== undefined
      && (!Number.isInteger(config.maxCaptureBytes)
      || config.maxCaptureBytes < 1024
      || config.maxCaptureBytes > MAX_ALLOWED_CAPTURE_BYTES)
    ) {
      throw new Error(`maxCaptureBytes must be between 1024 and ${MAX_ALLOWED_CAPTURE_BYTES}`);
    }

    if (
      config.maxPersistedOutputBytes !== undefined
      && (!Number.isInteger(config.maxPersistedOutputBytes)
      || config.maxPersistedOutputBytes < 1024
      || config.maxPersistedOutputBytes > MAX_ALLOWED_PERSISTED_OUTPUT_BYTES)
    ) {
      throw new Error(`maxPersistedOutputBytes must be between 1024 and ${MAX_ALLOWED_PERSISTED_OUTPUT_BYTES}`);
    }

    if (
      config.maxCaptureBytes !== undefined
      && config.maxPersistedOutputBytes !== undefined
      && config.maxPersistedOutputBytes > config.maxCaptureBytes
    ) {
      throw new Error('maxPersistedOutputBytes must not exceed maxCaptureBytes');
    }
  }
}
