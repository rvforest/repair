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

  protected buildSystemPrompt(): string {
    return `You are a helpful debugging assistant that analyzes terminal errors and provides clear explanations with actionable fixes.

When analyzing command output:
1. Explain what went wrong in simple, clear language
2. Provide specific, actionable fix suggestions as commands the user can run
3. If relevant, include additional context or links to documentation

Respond with valid JSON in this exact format:
{
  "explanation": "Clear explanation of the error",
  "fixes": ["command1", "command2"],
  "additionalContext": "Optional additional context"
}`;
  }

  protected buildUserPrompt(request: AnalysisRequest): string {
    let prompt = `Command that was run:\n\`\`\`\n${request.command}\n\`\`\`\n\n`;
    prompt += `Output:\n\`\`\`\n${request.output}\n\`\`\`\n\n`;

    if (request.shellContext) {
      prompt += `Context:\n`;
      if (request.shellContext.cwd) {
        prompt += `- Working directory: ${request.shellContext.cwd}\n`;
      }
      if (request.shellContext.shell) {
        prompt += `- Shell: ${request.shellContext.shell}\n`;
      }
      if (request.shellContext.exitCode !== undefined) {
        prompt += `- Exit code: ${request.shellContext.exitCode}\n`;
      }
      prompt += '\n';
    }

    prompt += 'Please analyze this error and provide an explanation with fix suggestions.';

    return prompt;
  }

  protected parseResponse(content: string): AnalysisResponse {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(content);

      if (!parsed.explanation || !Array.isArray(parsed.fixes)) {
        throw new Error('Invalid response format');
      }

      return {
        explanation: parsed.explanation,
        fixes: parsed.fixes,
        additionalContext: parsed.additionalContext,
      };
    } catch (error) {
      // Fallback: treat entire response as explanation
      return {
        explanation: content,
        fixes: [],
        additionalContext: 'Note: Could not parse structured response from LLM',
      };
    }
  }

  protected truncateOutput(output: string, maxTokens: number = 2000): string {
    // Rough estimate: 1 token ≈ 4 characters
    const maxChars = maxTokens * 4;

    if (output.length <= maxChars) {
      return output;
    }

    // Try to preserve error messages at the end
    const lines = output.split('\n');
    let truncated: string[] = [];
    let currentLength = 0;

    // Take lines from the end
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (currentLength + line.length > maxChars) {
        break;
      }
      truncated.unshift(line);
      currentLength += line.length;
    }

    return '... (output truncated) ...\n' + truncated.join('\n');
  }
}
