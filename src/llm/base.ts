import { AnalysisRequest, AnalysisResponse } from '../types';
import { TerminalSanitizer } from '../security';

const MAX_PROVIDER_ERROR_DETAIL_CHARS = 500;

export type ProviderErrorKind = 'authentication' | 'invalid-model' | 'rate-limit' | 'unknown';

export class ProviderHttpError extends Error {
  readonly providerName: string;
  readonly status: number;
  readonly kind: ProviderErrorKind;

  constructor(providerName: string, status: number, statusText: string, detail?: string) {
    const suffix = statusText ? ` ${statusText}` : '';
    const detailSuffix = detail ? `: ${detail}` : '';

    super(`${providerName} API error: ${status}${suffix}${detailSuffix}`);
    this.name = 'ProviderHttpError';
    this.providerName = providerName;
    this.status = status;
    this.kind = classifyProviderError(status, detail);
  }
}

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

  protected resolveBaseURL(defaultURL: string, allowLocalHttp: boolean = false): string {
    const candidate = this.baseURL || defaultURL;
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

    if (parsed.protocol === 'https:') {
      return parsed.toString().replace(/\/+$/, '');
    }

    if (allowLocalHttp && parsed.protocol === 'http:' && isLocalHost) {
      return parsed.toString().replace(/\/+$/, '');
    }

    throw new Error(`Insecure provider endpoint is not allowed: ${candidate}`);
  }

  protected buildHttpError(providerName: string, status: number, statusText: string, detail?: string): Error {
    return new ProviderHttpError(providerName, status, statusText, sanitizeProviderErrorDetail(detail));
  }
}

export function classifyProviderError(status: number, detail?: string): ProviderErrorKind {
  const normalizedDetail = detail?.toLowerCase() ?? '';

  if (status === 401 || status === 403 || /\b(auth|authentication|unauthorized|forbidden|api key)\b/.test(normalizedDetail)) {
    return 'authentication';
  }

  if (
    /\b(invalid model|invalid_model|model not found|unknown model|not a valid model)\b/.test(normalizedDetail)
    || (/model/.test(normalizedDetail) && /\b(not found|not available|unsupported|does not exist)\b/.test(normalizedDetail))
  ) {
    return 'invalid-model';
  }

  if (status === 429 || /\b(rate limit|too many requests)\b/.test(normalizedDetail)) {
    return 'rate-limit';
  }

  return 'unknown';
}

export async function readProviderErrorDetail(response: { text(): Promise<string> }): Promise<string | undefined> {
  try {
    return sanitizeProviderErrorDetail(extractProviderErrorMessage(await response.text()));
  } catch {
    return undefined;
  }
}

function extractProviderErrorMessage(body: string): string {
  if (!body.trim()) {
    return '';
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    const extracted = extractStringValue(parsed, ['error', 'message'])
      ?? extractStringValue(parsed, ['error', 'code'])
      ?? extractStringValue(parsed, ['message'])
      ?? extractStringValue(parsed, ['detail'])
      ?? (typeof parsed === 'string' ? parsed : undefined);

    return extracted ?? body;
  } catch {
    return body;
  }
}

function extractStringValue(value: unknown, path: string[]): string | undefined {
  let current = value;

  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === 'string' ? current : undefined;
}

function sanitizeProviderErrorDetail(detail?: string): string | undefined {
  if (!detail) {
    return undefined;
  }

  const terminalSanitizer = new TerminalSanitizer();
  const sanitized = redactProviderErrorSecrets(terminalSanitizer.sanitize(detail)).replace(/\s+/g, ' ').trim();
  const truncated = sanitized.length > MAX_PROVIDER_ERROR_DETAIL_CHARS
    ? `${sanitized.slice(0, MAX_PROVIDER_ERROR_DETAIL_CHARS)}...[TRUNCATED]`
    : sanitized;

  return truncated || undefined;
}

function redactProviderErrorSecrets(text: string): string {
  return text
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;"}]+/gi, '$1[REDACTED:AUTHORIZATION]')
    .replace(/\bsk-or-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED:OPENROUTER_KEY]')
    .replace(/\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, '[REDACTED:ANTHROPIC_KEY]')
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, '[REDACTED:OPENAI_KEY]')
    .replace(/\bAIza[0-9A-Za-z_-]{35}\b/g, '[REDACTED:GOOGLE_API_KEY]')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED:GITHUB_TOKEN]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED:JWT]')
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      '[REDACTED:PRIVATE_KEY]',
    );
}
