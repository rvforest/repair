#!/usr/bin/env node

import { Command } from 'commander';
import { ConfigManager } from './config';
import { wasErrorDisplayed } from './errors';
import { main } from './index';
import { generateShellInit } from './shell-hooks';
import { normalizeTimestamp, SessionStore } from './session';
import { version } from '../package.json';

const program = new Command();

program
  .name('repair')
  .description('LLM-driven CLI tool for explaining terminal errors and suggesting direct fixes or debug steps')
  .version(version)
  .option('--no-cache', 'Bypass cache and always make fresh API request')
  .option('--confirm', 'Display data before sending to LLM and wait for approval')
  .option('--verbose', 'Enable verbose output for troubleshooting')
  .option('--debug', 'Enable debug output')
  .action(async (options) => {
    try {
      await main({
        cacheEnabled: options.cache,
        confirmBeforeSend: options.confirm,
        verbose: options.verbose || options.debug,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (!wasErrorDisplayed(error)) {
          console.error(`Error: ${error.message}`);
        }
        if (options.verbose || options.debug) {
          console.error(error.stack);
        }
      }
      process.exit(1);
    }
  });

program
  .command('init <shell>')
  .description('Print shell integration for a supported shell')
  .action((shell: string) => {
    try {
      console.log(generateShellInit(shell));
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      }
      process.exit(1);
    }
  });

program
  .command('_capture-session')
  .description('Internal command used by shell integration')
  .requiredOption('--cmd <command>', 'Captured command text')
  .requiredOption('--code <exitCode>', 'Command exit code')
  .requiredOption('--ts <timestamp>', 'Command timestamp')
  .option('--cwd <cwd>', 'Working directory')
  .option('--shell <shell>', 'Shell name')
  .action(async (options: {
    cmd: string;
    code: string;
    ts: string;
    cwd?: string;
    shell?: string;
  }) => {
    try {
      const configManager = new ConfigManager();
      const captureConfig = await configManager.load({ requireApiKey: false });
      configManager.validate(captureConfig, { requireApiKey: false });

      const stdin = await readStdin(captureConfig.maxCaptureBytes);
      const sessionStore = new SessionStore();

      await sessionStore.capture({
        command: options.cmd,
        output: stdin.text,
        exitCode: Number(options.code),
        timestamp: normalizeTimestamp(options.ts),
        cwd: options.cwd,
        shell: options.shell,
      }, {
        includeCwd: captureConfig.includeCwd,
        stdinWasTruncated: stdin.truncated,
        maxPersistedOutputBytes: captureConfig.maxPersistedOutputBytes,
      });
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      }
      process.exit(1);
    }
  });

program.parse();

async function readStdin(maxBytes: number = 64 * 1024): Promise<{ text: string; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let bytesRead = 0;
  let truncated = false;

  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (bytesRead >= maxBytes) {
      truncated = true;
      continue;
    }

    const remaining = maxBytes - bytesRead;
    if (buffer.length > remaining) {
      chunks.push(buffer.subarray(0, remaining));
      bytesRead = maxBytes;
      truncated = true;
      continue;
    }

    chunks.push(buffer);
    bytesRead += buffer.length;
  }

  return {
    text: Buffer.concat(chunks).toString('utf8'),
    truncated,
  };
}
