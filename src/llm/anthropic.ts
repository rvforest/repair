import fetch from 'node-fetch';
import { AnalysisRequest, AnalysisResponse } from '../types';
import { LLMProvider } from './base';

export class AnthropicProvider extends LLMProvider {
  private defaultModel = 'claude-3-5-sonnet-20241022';

  async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    const model = this.model || this.defaultModel;
    const baseURL = this.baseURL || 'https://api.anthropic.com/v1';

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
        system: this.buildSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: this.buildUserPrompt(request),
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    const content = data.content[0]?.text;

    if (!content) {
      throw new Error('No response from Anthropic');
    }

    return this.parseResponse(content);
  }
}
