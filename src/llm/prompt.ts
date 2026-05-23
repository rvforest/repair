import { TerminalSanitizer } from '../security';
import { AnalysisRequest, AnalysisResponse } from '../types';

export const ANALYSIS_PROMPT_VERSION = 'analysis-v3';

const ANALYSIS_SYSTEM_PROMPT = `You are Repair, a terse debugging assistant for failed terminal commands.

Analyze the provided command, output, and shell context.
- Optimize for a fast terminal read, not a full write-up.
- Explain what failed in clear, direct language using 1 short sentence. Use 2 sentences only when the first would be ambiguous.
- Do not explain basic shell concepts unless they change the fix.
- Produce two remediation lanes when appropriate.
- directFixes: 0 to 3 runnable command candidates the user could try immediately.
- Use directFixes only for high-confidence corrections such as obvious typos, likely command replacements, or clearly malformed subcommands/flags.
- debugSteps: 0 to 3 short diagnostic commands or imperative checks that help the user disambiguate the problem.
- Put the highest-probability direct fix first.
- Do not put diagnostic commands like which, ls, echo $PATH, or --help in directFixes.
- Do not pad both arrays. If no safe direct fix is apparent, leave directFixes empty and use debugSteps.
- Avoid filler, hedging, repeated context, and long paragraphs.
- Use additionalContext only for one brief note when truncation, redaction, or uncertainty materially affects confidence. Otherwise omit it.

Respond with strict JSON only. Do not include Markdown fences, prose outside the JSON object, or extra keys.

The response schema is:
{
  "explanation": "Brief terminal-friendly explanation",
  "directFixes": ["corrected-command --flag", "alternative-command"],
  "debugSteps": ["which some-command", "some-command --help"],
  "additionalContext": "Optional brief note"
}`;

export interface BuiltAnalysisPrompt {
  version: string;
  system: string;
  user: string;
}

const sanitizer = new TerminalSanitizer();

export function buildAnalysisPrompt(request: AnalysisRequest): BuiltAnalysisPrompt {
  const payload = {
    command: sanitizer.sanitize(request.command),
    output: sanitizer.sanitize(request.output),
    ...(request.shellContext
      ? {
          context: {
            ...(request.shellContext.cwd ? { cwd: sanitizer.sanitize(request.shellContext.cwd) } : {}),
            ...(request.shellContext.shell ? { shell: sanitizer.sanitize(request.shellContext.shell) } : {}),
            ...(request.shellContext.exitCode !== undefined ? { exitCode: request.shellContext.exitCode } : {}),
            ...(request.shellContext.timestamp ? { timestamp: request.shellContext.timestamp } : {}),
          },
        }
      : {}),
    ...(request.captureMetadata
      ? {
          capture: {
            ...(request.captureMetadata.truncated !== undefined
              ? { truncated: request.captureMetadata.truncated }
              : {}),
            ...(request.captureMetadata.redactionsApplied !== undefined
              ? { redactionsApplied: request.captureMetadata.redactionsApplied }
              : {}),
          },
        }
      : {}),
  };

  return {
    version: ANALYSIS_PROMPT_VERSION,
    system: ANALYSIS_SYSTEM_PROMPT,
    user: [
      'Analyze this failed terminal command using the structured payload below.',
      'Prefer terse output that fits comfortably in a terminal pane.',
      'If the failure is obvious from stderr, avoid restating generic background information.',
      'Use directFixes for high-confidence runnable corrections and debugSteps for short diagnostic follow-ups.',
      'If the payload indicates truncation or redaction, account for that in your confidence and recommendations.',
      JSON.stringify(payload, null, 2),
    ].join('\n\n'),
  };
}

export function parseAnalysisResponse(content: string): AnalysisResponse {
  const sanitizedContent = sanitizer.sanitize(content).trim();

  for (const candidate of buildParseCandidates(sanitizedContent)) {
    try {
      const parsed = JSON.parse(candidate) as {
        explanation?: unknown;
        directFixes?: unknown;
        debugSteps?: unknown;
        additionalContext?: unknown;
      };

      if (typeof parsed.explanation !== 'string') {
        continue;
      }

      const directFixes = sanitizeStringArray(parsed.directFixes);
      const debugSteps = sanitizeStringArray(parsed.debugSteps);

      return {
        explanation: sanitizer.sanitize(parsed.explanation),
        directFixes,
        debugSteps,
        additionalContext:
          typeof parsed.additionalContext === 'string'
            ? sanitizer.sanitize(parsed.additionalContext)
            : undefined,
      };
    } catch {
      continue;
    }
  }

  return {
    explanation: sanitizedContent,
    directFixes: [],
    debugSteps: [],
    additionalContext: 'Note: Could not parse structured response from LLM',
  };
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => sanitizer.sanitize(String(entry)));
}

function buildParseCandidates(content: string): string[] {
  const candidates = [content];
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1].trim());
  }

  const objectStart = content.indexOf('{');
  const objectEnd = content.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd > objectStart) {
    candidates.push(content.slice(objectStart, objectEnd + 1));
  }

  return [...new Set(candidates.filter(Boolean))];
}