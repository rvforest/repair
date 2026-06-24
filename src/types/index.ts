export interface Config {
  provider: LLMProvider;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  scrollbackLines?: number;
  cacheEnabled?: boolean;
  cacheTTL?: number;
  confirmBeforeSend?: boolean;
  includeCwd?: boolean;
  maxCaptureBytes?: number;
  maxPersistedOutputBytes?: number;
}

export const LLM_PROVIDERS = ['openai', 'anthropic', 'google', 'openrouter', 'local'] as const;

export type LLMProvider = (typeof LLM_PROVIDERS)[number];
export type RemoteLLMProvider = Exclude<LLMProvider, 'local'>;

export interface LLMProviderConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
}

export interface AnalysisCaptureMetadata {
  truncated?: boolean;
  redactionsApplied?: number;
}

export interface AnalysisRequest {
  command: string;
  output: string;
  shellContext?: ShellContext;
  captureMetadata?: AnalysisCaptureMetadata;
}

export interface ShellContext {
  cwd?: string;
  shell?: string;
  exitCode?: number;
  timestamp?: string;
}

export interface SanitizedSessionBundle {
  command: string;
  output: string;
  exitCode: number;
  timestamp: string;
  cwd?: string;
  shell?: string;
  truncated: boolean;
  redactionsApplied: number;
}

export interface SessionWriteInput {
  command: string;
  output: string;
  exitCode: number;
  timestamp: string;
  cwd?: string;
  shell?: string;
}

export interface SanitizedResponseMetadata {
  explanation: string;
  directFixes: string[];
  debugSteps: string[];
  additionalContext?: string;
}

export interface AnalysisResponse {
  explanation: string;
  directFixes: string[];
  debugSteps: string[];
  additionalContext?: string;
}

export interface CacheEntry {
  response: AnalysisResponse;
  timestamp: number;
}
