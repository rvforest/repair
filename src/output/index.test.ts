import { describe, expect, it } from 'vitest';
import { OutputFormatter } from './index';

describe('OutputFormatter', () => {
  it('formats direct fixes and debug steps as separate terminal lanes', () => {
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: false,
    });

    try {
      const formatter = new OutputFormatter();
      const output = formatter.formatResponse({
        explanation: 'asdf is not installed or is not on your PATH.',
        directFixes: ['brew install asdf', 'mise use -g asdf@latest'],
        debugSteps: ['which asdf', 'echo $PATH'],
        additionalContext: 'If it is installed, reload your shell config.',
      });

      expect(output).toContain('=== Repair ===');
      expect(output).toContain('Why:\nasdf is not installed or is not on your PATH.');
      expect(output).toContain('Run now:\n  1. brew install asdf\n  2. mise use -g asdf@latest');
      expect(output).toContain('Or debug:\n  1. which asdf\n  2. echo $PATH');
      expect(output).toContain('Note:\nIf it is installed, reload your shell config.');
      expect(output).not.toContain('Explanation:');
      expect(output).not.toContain('Try:');
      expect(output).not.toContain('Additional Context:');
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', {
        configurable: true,
        value: originalIsTTY,
      });
    }
  });

  it('uses a single debug lane when no direct fix is available', () => {
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: false,
    });

    try {
      const formatter = new OutputFormatter();
      const output = formatter.formatResponse({
        explanation: 'The command failed because the config file is missing.',
        directFixes: [],
        debugSteps: ['ls -la .', 'cat repair.config.json'],
      });

      expect(output).toContain('Debug:\n  1. ls -la .\n  2. cat repair.config.json');
      expect(output).not.toContain('Run now:');
      expect(output).not.toContain('Or debug:');
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', {
        configurable: true,
        value: originalIsTTY,
      });
    }
  });
});
