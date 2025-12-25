import fetch from 'node-fetch';
import { AnalysisRequest, AnalysisResponse } from '../types';
import { LLMProvider } from './base';

export class LocalProvider extends LLMProvider {
  private defaultModel = 'llama2';

  async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    const model = this.model || this.defaultModel;

    if (!this.baseURL) {
      throw new Error('Base URL is required for local model provider');
    }

    // Use OpenAI-compatible API format (works with Ollama, LM Studio, etc.)
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
      throw new Error(`Local model API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from local model');
    }

    return this.parseResponse(content);
  }
}
