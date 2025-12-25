import fetch from 'node-fetch';
import { AnalysisRequest, AnalysisResponse } from '../types';
import { LLMProvider } from './base';

export class OpenRouterProvider extends LLMProvider {
  private defaultModel = 'anthropic/claude-3.5-sonnet';

  async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    const model = this.model || this.defaultModel;
    const baseURL = this.baseURL || 'https://openrouter.ai/api/v1';

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
            content: this.buildSystemPrompt(),
          },
          {
            role: 'user',
            content: this.buildUserPrompt(request),
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from OpenRouter');
    }

    return this.parseResponse(content);
  }
}
