import * as readline from 'readline';
import { AnalysisRequest, AnalysisResponse, SanitizedSessionBundle, SessionWriteInput } from '../types';

export const DEFAULT_MAX_CAPTURE_BYTES = 64 * 1024;
export const DEFAULT_MAX_PERSISTED_OUTPUT_BYTES = 16 * 1024;
export const MAX_ALLOWED_CAPTURE_BYTES = 512 * 1024;
export const MAX_ALLOWED_PERSISTED_OUTPUT_BYTES = 128 * 1024;
const MAX_COMMAND_BYTES = 4 * 1024;
const MAX_CWD_BYTES = 4 * 1024;

interface RedactionRule {
  label: string;
  pattern: RegExp;
  replacer?: string | ((...args: string[]) => string);
}

interface RedactionResult {
  text: string;
  replacements: number;
}

interface LimitResult {
  text: string;
  truncated: boolean;
}

interface SessionSanitizationOptions {
  includeCwd?: boolean;
  maxPersistedOutputBytes?: number;
  stdinWasTruncated?: boolean;
}

interface RequestSanitizationOptions {
  includeCwd?: boolean;
  maxPersistedOutputBytes?: number;
}

const CONTROL_SEQUENCE_PATTERN = /(?:\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b\[[0-?]*[ -/]*[@-~]|\u001b[@-Z\\-_])/g;

export class TerminalSanitizer {
  sanitize(text: string): string {
    const withoutNulls = text.replace(/\u0000/g, '');
    const normalized = withoutNulls.replace(/\r\n?/g, '\n');
    const withoutSequences = normalized.replace(CONTROL_SEQUENCE_PATTERN, '');

    let result = '';
    for (const char of withoutSequences) {
      const code = char.charCodeAt(0);
      if (char === '\n' || char === '\t' || (code >= 0x20 && code !== 0x7f)) {
        result += char;
      }
    }

    return result;
  }
}

export class CaptureLimiter {
  limitField(text: string, maxBytes: number): LimitResult {
    const byteLength = Buffer.byteLength(text, 'utf8');
    if (byteLength <= maxBytes) {
      return { text, truncated: false };
    }

    const marker = '\n...[TRUNCATED]';
    const markerBytes = Buffer.byteLength(marker, 'utf8');
    const budget = Math.max(0, maxBytes - markerBytes);
    let selected = '';

    for (const char of text) {
      const next = selected + char;
      if (Buffer.byteLength(next, 'utf8') > budget) {
        break;
      }
      selected = next;
    }

    return {
      text: `${selected}${marker}`,
      truncated: true,
    };
  }

  tailExcerpt(text: string, maxBytes: number): LimitResult {
    const byteLength = Buffer.byteLength(text, 'utf8');
    if (byteLength <= maxBytes) {
      return { text, truncated: false };
    }

    const marker = '...[TRUNCATED]\n';
    const markerBytes = Buffer.byteLength(marker, 'utf8');
    const lines = text.split('\n');
    const selected: string[] = [];
    let currentBytes = markerBytes;

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      const candidate = selected.length === 0 ? line : `${line}\n${selected[0]}`;
      const candidateBytes = Buffer.byteLength(candidate, 'utf8') + markerBytes;
      if (candidateBytes > maxBytes) {
        if (selected.length === 0) {
          const limited = this.limitField(line, maxBytes - markerBytes);
          return {
            text: `${marker}${limited.text}`,
            truncated: true,
          };
        }
        break;
      }

      selected.unshift(line);
      currentBytes = candidateBytes;
      if (currentBytes >= maxBytes) {
        break;
      }
    }

    return {
      text: `${marker}${selected.join('\n')}`,
      truncated: true,
    };
  }
}

export class SecretRedactor {
  private readonly rules: RedactionRule[] = [
    {
      label: 'OPENAI_KEY',
      pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,
      replacer: '[REDACTED:OPENAI_KEY]',
    },
    {
      label: 'ANTHROPIC_KEY',
      pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g,
      replacer: '[REDACTED:ANTHROPIC_KEY]',
    },
    {
      label: 'GITHUB_TOKEN',
      pattern: /gh[pousr]_[A-Za-z0-9]{20,}/g,
      replacer: '[REDACTED:GITHUB_TOKEN]',
    },
    {
      label: 'GOOGLE_API_KEY',
      pattern: /AIza[0-9A-Za-z_-]{35}/g,
      replacer: '[REDACTED:GOOGLE_API_KEY]',
    },
    {
      label: 'AWS_ACCESS_KEY',
      pattern: /AKIA[0-9A-Z]{16}/g,
      replacer: '[REDACTED:AWS_ACCESS_KEY]',
    },
    {
      label: 'AWS_SECRET_KEY',
      pattern: /(aws_secret_access_key\s*=\s*)[^\s]+/gi,
      replacer: '$1[REDACTED:AWS_SECRET_KEY]',
    },
    {
      label: 'BEARER_TOKEN',
      pattern: /(bearer\s+)[A-Za-z0-9._-]{16,}/gi,
      replacer: '$1[REDACTED:BEARER_TOKEN]',
    },
    {
      label: 'JWT',
      pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      replacer: '[REDACTED:JWT]',
    },
    {
      label: 'PRIVATE_KEY',
      pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      replacer: '[REDACTED:PRIVATE_KEY]',
    },
    {
      label: 'URL_CREDENTIAL',
      pattern: /(https?:\/\/[^\s:@]+:)([^@\s/]+)(@)/gi,
      replacer: '$1[REDACTED:URL_PASSWORD]$3',
    },
    {
      label: 'GENERIC_TOKEN',
      pattern: /\b(?=[A-Za-z0-9_-]{24,}\b)(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+\b/g,
      replacer: '[REDACTED:TOKEN]',
    },
  ];

  detectSecrets(text: string): boolean {
    return this.redact(text).replacements > 0;
  }

  redact(text: string): RedactionResult {
    let current = text;
    let replacements = 0;

    for (const rule of this.rules) {
      const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
      current = current.replace(pattern, (...args: string[]) => {
        replacements += 1;
        if (typeof rule.replacer === 'function') {
          return rule.replacer(...args);
        }
        return rule.replacer ?? `[REDACTED:${rule.label}]`;
      });
    }

    return { text: current, replacements };
  }
}

export class SecurityFilter {
  private readonly terminalSanitizer = new TerminalSanitizer();
  private readonly redactor = new SecretRedactor();
  private readonly limiter = new CaptureLimiter();

  detectSecrets(text: string): boolean {
    return this.redactor.detectSecrets(this.terminalSanitizer.sanitize(text));
  }

  redactSecrets(text: string): string {
    return this.redactor.redact(this.terminalSanitizer.sanitize(text)).text;
  }

  sanitizeForDisplay(text: string): string {
    return this.terminalSanitizer.sanitize(text);
  }

  sanitizeAnalysisRequest(
    request: AnalysisRequest,
    options: RequestSanitizationOptions = {},
  ): AnalysisRequest {
    const sanitizedCommand = this.terminalSanitizer.sanitize(request.command);
    const sanitizedOutput = this.terminalSanitizer.sanitize(request.output);
    const redactedCommand = this.redactor.redact(sanitizedCommand);
    const redactedOutput = this.redactor.redact(sanitizedOutput);
    const limitedCommand = this.limiter.limitField(redactedCommand.text, MAX_COMMAND_BYTES);
    const limitedOutput = this.limiter.tailExcerpt(
      redactedOutput.text,
      options.maxPersistedOutputBytes ?? DEFAULT_MAX_PERSISTED_OUTPUT_BYTES,
    );
    const cwd = options.includeCwd ? request.shellContext?.cwd : undefined;
    const sanitizedCwd = cwd ? this.redactor.redact(this.terminalSanitizer.sanitize(cwd)).text : undefined;
    const limitedCwd = sanitizedCwd ? this.limiter.limitField(sanitizedCwd, MAX_CWD_BYTES).text : undefined;
    const sanitizedCaptureMetadata = request.captureMetadata
      ? {
          ...(request.captureMetadata.truncated !== undefined
            ? { truncated: request.captureMetadata.truncated === true }
            : {}),
          ...(typeof request.captureMetadata.redactionsApplied === 'number'
            && Number.isInteger(request.captureMetadata.redactionsApplied)
            && request.captureMetadata.redactionsApplied >= 0
            ? { redactionsApplied: request.captureMetadata.redactionsApplied }
            : {}),
        }
      : undefined;

    return {
      command: limitedCommand.text,
      output: limitedOutput.text,
      shellContext: {
        ...(limitedCwd ? { cwd: limitedCwd } : {}),
        ...(request.shellContext?.shell ? { shell: this.terminalSanitizer.sanitize(request.shellContext.shell) } : {}),
        ...(request.shellContext?.exitCode !== undefined ? { exitCode: request.shellContext.exitCode } : {}),
        ...(request.shellContext?.timestamp ? { timestamp: request.shellContext.timestamp } : {}),
      },
      ...(sanitizedCaptureMetadata && Object.keys(sanitizedCaptureMetadata).length > 0
        ? { captureMetadata: sanitizedCaptureMetadata }
        : {}),
    };
  }

  sanitizeResponse(response: AnalysisResponse): AnalysisResponse {
    return {
      explanation: this.terminalSanitizer.sanitize(response.explanation),
      directFixes: response.directFixes.map((fix) => this.terminalSanitizer.sanitize(fix)),
      debugSteps: response.debugSteps.map((step) => this.terminalSanitizer.sanitize(step)),
      ...(response.additionalContext
        ? { additionalContext: this.terminalSanitizer.sanitize(response.additionalContext) }
        : {}),
    };
  }

  sanitizeSessionBundle(
    input: SessionWriteInput,
    options: SessionSanitizationOptions = {},
  ): SanitizedSessionBundle {
    const sanitizedCommand = this.terminalSanitizer.sanitize(input.command);
    const sanitizedOutput = this.terminalSanitizer.sanitize(input.output);
    const sanitizedCwd = input.cwd ? this.terminalSanitizer.sanitize(input.cwd) : undefined;

    const redactedCommand = this.redactor.redact(sanitizedCommand);
    const redactedOutput = this.redactor.redact(sanitizedOutput);
    const redactedCwd = sanitizedCwd ? this.redactor.redact(sanitizedCwd) : undefined;

    const limitedCommand = this.limiter.limitField(redactedCommand.text, MAX_COMMAND_BYTES);
    const limitedOutput = this.limiter.tailExcerpt(
      redactedOutput.text,
      options.maxPersistedOutputBytes ?? DEFAULT_MAX_PERSISTED_OUTPUT_BYTES,
    );
    const limitedCwd = options.includeCwd && redactedCwd
      ? this.limiter.limitField(redactedCwd.text, MAX_CWD_BYTES)
      : undefined;

    return {
      command: limitedCommand.text,
      output: limitedOutput.text,
      exitCode: input.exitCode,
      timestamp: input.timestamp,
      ...(options.includeCwd && limitedCwd?.text ? { cwd: limitedCwd.text } : {}),
      ...(input.shell ? { shell: this.terminalSanitizer.sanitize(input.shell) } : {}),
      truncated: Boolean(options.stdinWasTruncated || limitedCommand.truncated || limitedOutput.truncated || limitedCwd?.truncated),
      redactionsApplied: redactedCommand.replacements + redactedOutput.replacements + (redactedCwd?.replacements ?? 0),
    };
  }

  async confirmSend(
    command: string,
    output: string,
    metadata?: { truncated?: boolean; redactionsApplied?: number },
  ): Promise<boolean> {
    const safeCommand = this.terminalSanitizer.sanitize(command);
    const safeOutput = this.terminalSanitizer.sanitize(output);

    console.log('\n--- Data to be sent to LLM ---');
    console.log('Command:', safeCommand);
    console.log('\nOutput (truncated to 500 chars):');
    console.log(safeOutput.substring(0, 500));
    if (safeOutput.length > 500) {
      console.log(`\n... (${safeOutput.length - 500} more characters)`);
    }
    if (metadata?.redactionsApplied || metadata?.truncated) {
      console.log('\nSanitization metadata:');
      if (metadata.redactionsApplied) {
        console.log(`- Redactions applied: ${metadata.redactionsApplied}`);
      }
      if (metadata.truncated) {
        console.log('- Output was truncated before persistence and request construction');
      }
    }
    console.log('\n--- End of data ---\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question('Send this data to the LLM? (y/N): ', (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }
}
