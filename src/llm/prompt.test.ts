import { describe, expect, it } from 'vitest';
import { ANALYSIS_PROMPT_VERSION, buildAnalysisPrompt, parseAnalysisResponse } from './prompt';

describe('buildAnalysisPrompt', () => {
  it('builds a structured prompt with safe context and capture metadata', () => {
    const prompt = buildAnalysisPrompt({
      command: 'npm test\u001b[31m',
      output: 'Error: boom\u0000',
      shellContext: {
        cwd: '/tmp/project',
        shell: 'zsh',
        exitCode: 1,
        timestamp: '2026-04-30T06:00:00.000Z',
      },
      captureMetadata: {
        truncated: true,
        redactionsApplied: 2,
      },
    });

    expect(prompt.version).toBe(ANALYSIS_PROMPT_VERSION);
    expect(prompt.system).toContain('strict JSON only');
    expect(prompt.system).toContain('Optimize for a fast terminal read');
    expect(prompt.system).toContain('1 short sentence');
    expect(prompt.system).toContain('directFixes');
    expect(prompt.system).toContain('debugSteps');
    expect(prompt.user).toContain('"command": "npm test"');
    expect(prompt.user).toContain('"output": "Error: boom"');
    expect(prompt.user).toContain('"cwd": "/tmp/project"');
    expect(prompt.user).toContain('"truncated": true');
    expect(prompt.user).toContain('"redactionsApplied": 2');
    expect(prompt.user).toContain('Prefer terse output that fits comfortably in a terminal pane.');
    expect(prompt.user).toContain('Use directFixes for high-confidence runnable corrections');
  });

  it('limits oversized output while preserving its tail and reporting truncation', () => {
    const prompt = buildAnalysisPrompt({
      command: 'npm test',
      output: `START-${'x'.repeat(9_000)}-FINAL ERROR`,
      captureMetadata: {
        truncated: false,
        redactionsApplied: 0,
      },
    });

    const payload = JSON.parse(prompt.user.slice(prompt.user.indexOf('{'))) as {
      output: string;
      capture: {
        truncated: boolean;
        redactionsApplied: number;
      };
    };

    expect(payload.output.length).toBeLessThanOrEqual(8_000);
    expect(payload.output).toContain('output truncated for analysis');
    expect(payload.output).not.toContain('START-');
    expect(payload.output.endsWith('-FINAL ERROR')).toBe(true);
    expect(payload.capture).toEqual({
      truncated: true,
      redactionsApplied: 0,
    });
  });

  it('adds capture metadata when only prompt-level truncation occurred', () => {
    const prompt = buildAnalysisPrompt({
      command: 'npm test',
      output: 'x'.repeat(9_000),
    });

    expect(prompt.user).toContain('"truncated": true');
  });
});

describe('parseAnalysisResponse', () => {
  it('parses fenced JSON responses with separate remediation lanes', () => {
    const response = parseAnalysisResponse([
      '```json',
      '{',
      '  "explanation": "Missing dependency",',
      '  "directFixes": ["npm install"],',
      '  "debugSteps": ["npm ls"],',
      '  "additionalContext": "Install project dependencies first"',
      '}',
      '```',
    ].join('\n'));

    expect(response).toEqual({
      explanation: 'Missing dependency',
      directFixes: ['npm install'],
      debugSteps: ['npm ls'],
      additionalContext: 'Install project dependencies first',
    });
  });

  it('defaults missing remediation arrays to empty lists', () => {
    const response = parseAnalysisResponse('{"explanation":"Missing dependency"}');

    expect(response).toEqual({
      explanation: 'Missing dependency',
      directFixes: [],
      debugSteps: [],
    });
  });

  it('falls back to plain explanation when no JSON can be parsed', () => {
    const response = parseAnalysisResponse('Something went wrong');

    expect(response).toEqual({
      explanation: 'Something went wrong',
      directFixes: [],
      debugSteps: [],
      additionalContext: 'Note: Could not parse structured response from LLM',
    });
  });
});
