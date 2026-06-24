import fetch from 'node-fetch';
import { AnalysisRequest, AnalysisResponse } from '../types';
import { LLMProvider } from './base';
import { buildAnalysisPrompt, parseAnalysisResponse } from './prompt';

interface OpenAICompatibleChatResponse {
  choices: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class LocalProvider extends LLMProvider {
  private defaultModel = 'llama2';

  async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    const model = this.model || this.defaultModel;

    if (!this.baseURL) {
      throw new Error('Base URL is required for local model provider');
    }

    const baseURL = this.resolveBaseURL(this.baseURL, true);
    const prompt = buildAnalysisPrompt(request);

    // Use OpenAI-compatible API format (works with Ollama, LM Studio, etc.)
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
      throw this.buildHttpError('Local model', response.status, response.statusText);
    }

    const data = (await response.json()) as OpenAICompatibleChatResponse;
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from local model');
    }

    return parseAnalysisResponse(content);
  }
}
