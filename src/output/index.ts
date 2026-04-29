import chalk from 'chalk';
import { AnalysisResponse } from '../types';
import { TerminalSanitizer } from '../security';

export class OutputFormatter {
  private supportsColor: boolean;
  private readonly sanitizer = new TerminalSanitizer();

  constructor() {
    // Check if terminal supports color
    this.supportsColor = process.stdout.isTTY && chalk.level > 0;
  }

  formatResponse(response: AnalysisResponse): string {
    const safeResponse = {
      explanation: this.sanitizer.sanitize(response.explanation),
      fixes: response.fixes.map((fix) => this.sanitizer.sanitize(fix)),
      additionalContext: response.additionalContext ? this.sanitizer.sanitize(response.additionalContext) : undefined,
    };

    let output = '';

    // Header
    output += this.formatHeader('Error Analysis');
    output += '\n\n';

    // Explanation section
    output += this.formatSection('Explanation', safeResponse.explanation);
    output += '\n\n';

    // Fixes section
    if (safeResponse.fixes.length > 0) {
      output += this.formatSection('Suggested Fixes');
      output += '\n';

      safeResponse.fixes.forEach((fix, index) => {
        output += this.formatCommand(fix, index + 1);
        output += '\n';
      });
    }

    // Additional context section
    if (safeResponse.additionalContext) {
      output += '\n';
      output += this.formatSection('Additional Context', safeResponse.additionalContext);
      output += '\n';
    }

    return output;
  }

  private formatHeader(text: string): string {
    if (this.supportsColor) {
      return chalk.bold.blue(`═══ ${text} ═══`);
    }
    return `=== ${text} ===`;
  }

  private formatSection(title: string, content?: string): string {
    let output = '';

    if (this.supportsColor) {
      output += chalk.bold.cyan(`${title}:`);
    } else {
      output += `${title}:`;
    }

    if (content) {
      output += '\n' + this.wrapText(content);
    }

    return output;
  }

  private formatCommand(command: string, index?: number): string {
    let output = '';

    if (index !== undefined) {
      if (this.supportsColor) {
        output += chalk.gray(`  ${index}. `);
      } else {
        output += `  ${index}. `;
      }
    }

    if (this.supportsColor) {
      output += chalk.green(command);
    } else {
      output += command;
    }

    return output;
  }

  private wrapText(text: string, maxWidth: number = 80): string {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + word).length > maxWidth && currentLine.length > 0) {
        lines.push(currentLine.trim());
        currentLine = word + ' ';
      } else {
        currentLine += word + ' ';
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine.trim());
    }

    return lines.join('\n');
  }

  formatError(message: string): string {
    const safeMessage = this.sanitizer.sanitize(message);
    if (this.supportsColor) {
      return chalk.red('Error: ') + safeMessage;
    }
    return 'Error: ' + safeMessage;
  }

  formatWarning(message: string): string {
    const safeMessage = this.sanitizer.sanitize(message);
    if (this.supportsColor) {
      return chalk.yellow('Warning: ') + safeMessage;
    }
    return 'Warning: ' + safeMessage;
  }

  formatInfo(message: string): string {
    const safeMessage = this.sanitizer.sanitize(message);
    if (this.supportsColor) {
      return chalk.blue('Info: ') + safeMessage;
    }
    return 'Info: ' + safeMessage;
  }

  formatSuccess(message: string): string {
    const safeMessage = this.sanitizer.sanitize(message);
    if (this.supportsColor) {
      return chalk.green('✓ ') + safeMessage;
    }
    return '✓ ' + safeMessage;
  }
}
