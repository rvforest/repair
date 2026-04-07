export interface Config {
  provider: LLMProvider;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  scrollbackLines?: number;
  cacheEnabled?: boolean;
  cacheTTL?: number;
  confirmBeforeSend?: boolean;
}

export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'local';

export interface LLMProviderConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
}

export interface AnalysisRequest {
  command: string;
  output: string;
  shellContext?: ShellContext;
}

export interface ShellContext {
  cwd?: string;
  shell?: string;
  exitCode?: number;
  timestamp?: string;
}

export interface CapturedSession {
  command: string;
  output: string;
  exitCode: number;
  timestamp: string;
  cwd?: string;
  shell?: string;
}

export interface SessionWriteInput {
  command: string;
  output: string;
  exitCode: number;
  timestamp: string;
  cwd?: string;
  shell?: string;
}

export interface AnalysisResponse {
  explanation: string;
  fixes: string[];
  additionalContext?: string;
}

export interface CacheEntry {
  response: AnalysisResponse;
  timestamp: number;
}
