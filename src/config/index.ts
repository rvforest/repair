import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config, LLMProvider } from '../types';

const DEFAULT_CONFIG: Config = {
  provider: 'openai',
  scrollbackLines: 100,
  cacheEnabled: true,
  cacheTTL: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  confirmBeforeSend: false,
};

export class ConfigManager {
  private configPath: string;

  constructor() {
    const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    this.configPath = path.join(configDir, 'repair', 'config.json');
  }

  async load(): Promise<Config> {
    // Check environment variables first
    const envProvider = process.env.REPAIR_PROVIDER as LLMProvider;
    const envApiKey = process.env.REPAIR_API_KEY;
    const envModel = process.env.REPAIR_MODEL;

    // Try to load from config file
    let fileConfig: Partial<Config> = {};
    if (fs.existsSync(this.configPath)) {
      try {
        const fileContent = fs.readFileSync(this.configPath, 'utf-8');
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
    };

    // If no API key is found, prompt user to configure
    if (!config.apiKey) {
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
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Load existing config if it exists
    let existingConfig: Partial<Config> = {};
    if (fs.existsSync(this.configPath)) {
      try {
        const fileContent = fs.readFileSync(this.configPath, 'utf-8');
        existingConfig = JSON.parse(fileContent);
      } catch (error) {
        // Ignore parse errors, will overwrite
      }
    }

    // Merge and save
    const mergedConfig = { ...existingConfig, ...config };
    fs.writeFileSync(this.configPath, JSON.stringify(mergedConfig, null, 2), 'utf-8');
  }

  validate(config: Config): void {
    const validProviders: LLMProvider[] = ['openai', 'anthropic', 'google', 'openrouter', 'local'];

    if (!validProviders.includes(config.provider)) {
      throw new Error(
        `Invalid provider: ${config.provider}. Valid providers are: ${validProviders.join(', ')}`
      );
    }

    if (!config.apiKey && config.provider !== 'local') {
      throw new Error(`API key is required for provider: ${config.provider}`);
    }

    if (config.scrollbackLines && (config.scrollbackLines < 10 || config.scrollbackLines > 1000)) {
      throw new Error('scrollbackLines must be between 10 and 1000');
    }

    if (config.maxTokens && config.maxTokens < 100) {
      throw new Error('maxTokens must be at least 100');
    }
  }
}
