import { LLMProvider as BaseLLMProvider } from './base';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GoogleProvider } from './google';
import { OpenRouterProvider } from './openrouter';
import { LocalProvider } from './local';
import { Config } from '../types';

export function createLLMProvider(config: Config): BaseLLMProvider {
  const apiKey = config.apiKey || '';

  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider(apiKey, config.model);

    case 'anthropic':
      return new AnthropicProvider(apiKey, config.model);

    case 'google':
      return new GoogleProvider(apiKey, config.model);

    case 'openrouter':
      return new OpenRouterProvider(apiKey, config.model);

    case 'local': {
      if (!config.model) {
        throw new Error('Model is required for local provider');
      }
      const baseURL = process.env.REPAIR_LOCAL_URL || 'http://localhost:11434/v1';
      return new LocalProvider(apiKey, config.model, baseURL);
    }

    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

export { BaseLLMProvider as LLMProvider };
