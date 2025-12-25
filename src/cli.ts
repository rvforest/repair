#!/usr/bin/env node

import { Command } from 'commander';
import { main } from './index';
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
        console.error(`Error: ${error.message}`);
        if (options.verbose || options.debug) {
          console.error(error.stack);
        }
      }
      process.exit(1);
    }
  });

program.parse();
