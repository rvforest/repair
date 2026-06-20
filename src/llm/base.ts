import { AnalysisRequest, AnalysisResponse } from '../types';

export abstract class LLMProvider {
  protected apiKey: string;
  protected model?: string;
  protected baseURL?: string;

  constructor(apiKey: string, model?: string, baseURL?: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = baseURL;
  }

  abstract analyze(request: AnalysisRequest): Promise<AnalysisResponse>;

  protected resolveBaseURL(defaultURL: string, allowLocalHttp: boolean = false): string {
    const candidate = this.baseURL || defaultURL;
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

    if (parsed.protocol === 'https:') {
      return parsed.toString().replace(/\/+$/, '');
    }

    if (allowLocalHttp && parsed.protocol === 'http:' && isLocalHost) {
      return parsed.toString().replace(/\/+$/, '');
    }

    throw new Error(`Insecure provider endpoint is not allowed: ${candidate}`);
  }

  protected buildHttpError(providerName: string, status: number, statusText: string): Error {
    const suffix = statusText ? ` ${statusText}` : '';
    return new Error(`${providerName} API error: ${status}${suffix}`);
  }
}
