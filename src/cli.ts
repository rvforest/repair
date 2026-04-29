#!/usr/bin/env node

import { Command } from 'commander';
import { wasErrorDisplayed } from './errors';
import { main } from './index';
import { generateShellInit } from './shell-hooks';
import { normalizeTimestamp, SessionStore } from './session';
import { version } from '../package.json';

const program = new Command();

program
  .name('repair')
  .description('LLM-driven CLI tool for explaining terminal errors and suggesting fixes')
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
  .command('_write-session')
  .description('Internal command used by shell integration')
  .requiredOption('--cmd <command>', 'Captured command text')
  .option('--output <output>', 'Captured output text')
  .option('--output-file <file>', 'Path to captured output file')
  .requiredOption('--code <exitCode>', 'Command exit code')
  .requiredOption('--ts <timestamp>', 'Command timestamp')
  .option('--cwd <cwd>', 'Working directory')
  .option('--shell <shell>', 'Shell name')
  .action(async (options: {
    cmd: string;
    output?: string;
    outputFile?: string;
    code: string;
    ts: string;
    cwd?: string;
    shell?: string;
  }) => {
    try {
      const sessionStore = new SessionStore();
      const output = options.outputFile
        ? require('fs').readFileSync(options.outputFile, 'utf-8')
        : (options.output || '');

      await sessionStore.write({
        command: options.cmd,
        output,
        exitCode: Number(options.code),
        timestamp: normalizeTimestamp(options.ts),
        cwd: options.cwd,
        shell: options.shell,
      });
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      }
      process.exit(1);
    }
  });

program.parse();
