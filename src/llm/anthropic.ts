import fetch from 'node-fetch';
import { AnalysisRequest, AnalysisResponse } from '../types';
import { LLMProvider } from './base';
import { buildAnalysisPrompt, parseAnalysisResponse } from './prompt';

export class AnthropicProvider extends LLMProvider {
  private defaultModel = 'claude-haiku-4-5-20251001';

  async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    const model = this.model || this.defaultModel;
    const baseURL = this.resolveBaseURL('https://api.anthropic.com/v1');
    const prompt = buildAnalysisPrompt(request);

    const response = await fetch(`${baseURL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        system: prompt.system,
        messages: [
          {
            role: 'user',
            content: prompt.user,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw this.buildHttpError('Anthropic', response.status, response.statusText);
    }

    const data = await response.json() as any;
    const content = data.content[0]?.text;

    if (!content) {
      throw new Error('No response from Anthropic');
    }

    return parseAnalysisResponse(content);
  }
}
