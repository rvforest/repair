import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import { generateShellInit, getSupportedShells } from './index';

const EXPECTED_CAPTURED_OUTPUT = 'captured output';
const SLOW_TEE_DELAY_SECS = 0.2;

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

  it('generates a zsh snippet with secure stdin capture and cleanup hooks', () => {
    const snippet = generateShellInit('zsh');

    expect(snippet).toContain('add-zsh-hook preexec repair_preexec');
    expect(snippet).toContain('repair _capture-session');
    expect(snippet).toContain('add-zsh-hook zshexit repair_zsh_cleanup');
    expect(snippet).toContain('sudo|doas|su|pass|op|bw|vault|secret-tool|security|env|printenv');
    expect(snippet).toContain('REPAIR_SHELL_INTEGRATION=1');
    expect(snippet).toContain('repair_start_redirect');
    expect(snippet).toContain('repair_restore_redirect');
    expect(snippet).toContain('} always {');
  });

  it('generates a bash snippet with DEBUG, PROMPT_COMMAND, and cleanup hooks', () => {
    const snippet = generateShellInit('bash');

    expect(snippet).toContain("trap 'repair_debug_trap' DEBUG");
    expect(snippet).toContain("trap 'repair_shell_cleanup' EXIT");
    expect(snippet).toContain("PROMPT_COMMAND='repair_prompt_command'");
    expect(snippet).toContain('repair _capture-session');
    expect(snippet).toContain('repair_start_redirect');
    expect(snippet).toContain('repair_restore_redirect');
    expect(snippet).toContain('local _output_file=');
    expect(snippet).toContain('< "$_output_file"');
  });

  it('skips sensitive commands by default without over-skipping cat', () => {
    const snippet = generateShellInit('bash');

    expect(snippet).toContain('sudo|doas|su|pass|op|bw|vault|secret-tool|security|env|printenv');
    expect(snippet).not.toContain('cat|');
  });

  it('waits for tee helpers before returning from restore', () => {
    const snippet = generateShellInit('bash');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-shell-hooks-'));
    const teePath = path.join(tempDir, 'tee');
    const capturePath = path.join(tempDir, 'capture.log');

    try {
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
sleep ${SLOW_TEE_DELAY_SECS}
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

exec 3>&1
exec >/dev/null
REPAIR_LAST_OUTPUT_FILE=${JSON.stringify(capturePath)}
repair_start_redirect
printf ${JSON.stringify(EXPECTED_CAPTURED_OUTPUT)}
repair_restore_redirect
exec >&3
exec 3>&-
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

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(String(Buffer.byteLength(EXPECTED_CAPTURED_OUTPUT)));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('adds zsh monitor suppression around tee helpers', () => {
    const snippet = generateShellInit('zsh');

    expect(snippet).toContain('setopt localoptions nomonitor');
    expect(snippet.match(/setopt localoptions nomonitor/g)).toHaveLength(2);
  });

  it('rejects unsupported shells with guidance', () => {
    expect(() => generateShellInit('fish')).toThrow('Supported shells: bash, zsh');
  });
});
