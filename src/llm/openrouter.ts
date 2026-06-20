import fetch from 'node-fetch';
import { AnalysisRequest, AnalysisResponse } from '../types';
import { LLMProvider } from './base';
import { buildAnalysisPrompt, parseAnalysisResponse } from './prompt';

export class OpenRouterProvider extends LLMProvider {
  private defaultModel = 'anthropic/claude-haiku-4-5-20251001';

  async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    const model = this.model || this.defaultModel;
    const baseURL = this.resolveBaseURL('https://openrouter.ai/api/v1');
    const prompt = buildAnalysisPrompt(request);

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/repair-cli',
        'X-Title': 'Repair CLI',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: prompt.system,
          },
          {
            role: 'user',
            content: prompt.user,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw this.buildHttpError('OpenRouter', response.status, response.statusText);
    }

    const data = await response.json() as any;
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from OpenRouter');
    }

    return parseAnalysisResponse(content);
  }
}
