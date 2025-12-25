import { exec } from 'child_process';
import { promisify } from 'util';
import { ZellijInfo, AnalysisRequest } from '../types';

const execAsync = promisify(exec);

export class ZellijIntegration {
  async detectZellij(): Promise<ZellijInfo> {
    const inZellij = !!process.env.ZELLIJ || !!process.env.ZELLIJ_SESSION_NAME;

    if (!inZellij) {
      return { inZellij: false };
    }

    const sessionName = process.env.ZELLIJ_SESSION_NAME;

    // Try to get Zellij version
    let version: string | undefined;
    try {
      const { stdout } = await execAsync('zellij --version');
      const match = stdout.match(/zellij\s+(\d+\.\d+\.\d+)/);
      if (match) {
        version = match[1];
      }
    } catch (error) {
      // Version check failed, but we're still in Zellij
    }

    return {
      inZellij: true,
      sessionName,
      version,
    };
  }

  async checkZellijInstalled(): Promise<boolean> {
    try {
      await execAsync('which zellij');
      return true;
    } catch {
      return false;
    }
  }

  async checkVersion(minVersion: string = '0.38.0'): Promise<boolean> {
    try {
      const { stdout } = await execAsync('zellij --version');
      const match = stdout.match(/zellij\s+(\d+\.\d+\.\d+)/);
      if (!match) return false;

      const currentVersion = match[1];
      return this.compareVersions(currentVersion, minVersion) >= 0;
    } catch {
      return false;
    }
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if (parts1[i] > parts2[i]) return 1;
      if (parts1[i] < parts2[i]) return -1;
    }
    return 0;
  }

  async getPaneOutput(maxLines: number = 100): Promise<string> {
    try {
      // Use zellij action to dump screen content
      const { stdout } = await execAsync('zellij action dump-screen -');

      // Split into lines and limit
      const lines = stdout.split('\n');
      const limitedLines = lines.slice(-maxLines);

      return limitedLines.join('\n');
    } catch (error) {
      throw new Error(
        'Failed to retrieve pane output from Zellij. ' +
        'Make sure you are running this command inside a Zellij session.'
      );
    }
  }

  extractLastCommand(output: string): { command: string; commandOutput: string } {
    const lines = output.split('\n');

    // Common shell prompts patterns
    const promptPatterns = [
      /^[\w-]+@[\w-]+:.*[\$#]\s*(.+)$/,  // user@host:path$ command
      /^[\$#]\s*(.+)$/,                    // $ command
      /^>\s*(.+)$/,                        // > command
      /^❯\s*(.+)$/,                        // ❯ command (starship, etc.)
      /^\(.*\)\s*[\$#]\s*(.+)$/,          // (venv)$ command
    ];

    let lastCommandIndex = -1;
    let command = '';

    // Search backwards for the last command
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];

      for (const pattern of promptPatterns) {
        const match = line.match(pattern);
        if (match) {
          command = match[1] || match[0];
          lastCommandIndex = i;
          break;
        }
      }

      if (lastCommandIndex !== -1) break;
    }

    // If no command found, use a heuristic
    if (lastCommandIndex === -1) {
      // Look for the last non-empty line as potential command
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim()) {
          command = lines[i].trim();
          lastCommandIndex = i;
          break;
        }
      }
    }

    // Extract output after the command
    const commandOutput = lines.slice(lastCommandIndex + 1).join('\n');

    // Handle multi-line commands (continuation with \)
    if (lastCommandIndex > 0) {
      let searchIndex = lastCommandIndex - 1;
      while (searchIndex >= 0 && lines[searchIndex].trim().endsWith('\\')) {
        command = lines[searchIndex].trim().slice(0, -1) + ' ' + command;
        searchIndex--;
      }
    }

    return {
      command: command.trim(),
      commandOutput: commandOutput.trim(),
    };
  }

  async buildAnalysisRequest(maxLines: number = 100): Promise<AnalysisRequest> {
    const output = await this.getPaneOutput(maxLines);
    const { command, commandOutput } = this.extractLastCommand(output);

    return {
      command,
      output: commandOutput,
      shellContext: {
        cwd: process.cwd(),
        shell: process.env.SHELL,
      },
    };
  }
}
