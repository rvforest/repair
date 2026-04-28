import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import { generateShellInit, getSupportedShells } from './index';

function extractFunction(snippet: string, name: string): string {
  const match = snippet.match(new RegExp(`  ${name}\\(\\) \\{[\\s\\S]*?\\n  \\}`, 'm'));

  if (!match) {
    throw new Error(`Could not extract ${name} from shell snippet`);
  }

  return match[0];
}

describe('shell hook generation', () => {
  it('lists supported shells', () => {
    expect(getSupportedShells()).toEqual(['bash', 'zsh']);
  });

  it('generates a zsh snippet with the session writer command', () => {
    const snippet = generateShellInit('zsh');

    expect(snippet).toContain('add-zsh-hook preexec repair_preexec');
    expect(snippet).toContain('repair _write-session');
    expect(snippet).toContain('REPAIR_SHELL_INTEGRATION=1');
    expect(snippet).toContain('repair_start_redirect');
    expect(snippet).toContain('repair_restore_redirect');
    expect(snippet).toContain('} always {');
  });

  it('generates a bash snippet with DEBUG and PROMPT_COMMAND hooks', () => {
    const snippet = generateShellInit('bash');

    expect(snippet).toContain("trap 'repair_debug_trap' DEBUG");
    expect(snippet).toContain("PROMPT_COMMAND='repair_prompt_command'");
    expect(snippet).toContain('repair _write-session');
    expect(snippet).toContain('repair_start_redirect');
    expect(snippet).toContain('repair_restore_redirect');
    expect(snippet).toContain('local _output_file=');
  });

  it('waits for tee helpers before returning from restore', () => {
    const snippet = generateShellInit('bash');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-shell-hooks-'));
    const teePath = path.join(tempDir, 'tee');
    const capturePath = path.join(tempDir, 'capture.log');

    fs.writeFileSync(
      teePath,
      `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "-a" ]]; then
  file="$2"
  shift 2
else
  file=""
fi
payload="$(cat)"
sleep 0.2
if [[ -n "$file" ]]; then
  printf '%s' "$payload" >> "$file"
fi
printf '%s' "$payload"
`,
      { mode: 0o755 },
    );

    const result = spawnSync(
      'bash',
      [
        '-lc',
        `set -euo pipefail
${extractFunction(snippet, 'repair_start_redirect')}

${extractFunction(snippet, 'repair_restore_redirect')}

REPAIR_LAST_OUTPUT_FILE=${JSON.stringify(capturePath)}
repair_start_redirect
printf 'captured output'
repair_restore_redirect
wc -c < ${JSON.stringify(capturePath)}
`,
      ],
      {
        env: {
          ...process.env,
          PATH: `${tempDir}:${process.env.PATH || ''}`,
        },
        encoding: 'utf-8',
      },
    );

    fs.rmSync(tempDir, { recursive: true, force: true });

    expect(result.status).toBe(0);
    expect(result.stdout.match(/(\d+)\s*$/)?.[1]).toBe('15');
  });

  it('rejects unsupported shells with guidance', () => {
    expect(() => generateShellInit('fish')).toThrow('Supported shells: bash, zsh');
  });
});
