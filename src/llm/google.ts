import fetch from 'node-fetch';
import { AnalysisRequest, AnalysisResponse } from '../types';
import { LLMProvider } from './base';

export class GoogleProvider extends LLMProvider {
  private defaultModel = 'gemini-2.5-flash-lite';

  async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    const model = this.model || this.defaultModel;
    const baseURL = this.resolveBaseURL('https://generativelanguage.googleapis.com/v1beta');

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(request);

    const response = await fetch(
      `${baseURL}/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${systemPrompt}\n\n${userPrompt}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1000,
          },
        }),
      }
    );

    if (!response.ok) {
      throw this.buildHttpError('Google', response.status, response.statusText);
    }

    const data = await response.json() as any;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('No response from Google Gemini');
    }

    return this.parseResponse(content);
  }
}
