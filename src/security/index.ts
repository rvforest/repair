import * as readline from 'readline';

export class SecurityFilter {
  private secretPatterns: RegExp[] = [
    // API keys and tokens
    /\b[A-Za-z0-9]{32,}\b/g,  // Generic long strings
    /sk-[A-Za-z0-9]{32,}/g,    // OpenAI API keys
    /xoxb-[A-Za-z0-9-]+/g,     // Slack tokens
    /ghp_[A-Za-z0-9]{36}/g,    // GitHub personal access tokens
    /gho_[A-Za-z0-9]{36}/g,    // GitHub OAuth tokens
    /AIza[A-Za-z0-9_-]{35}/g,  // Google API keys

    // AWS credentials
    /AKIA[A-Z0-9]{16}/g,
    /aws_access_key_id\s*=\s*[A-Z0-9]+/gi,
    /aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]+/gi,

    // Private keys
    /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,

    // Passwords in URLs
    /(?:https?:\/\/)[^:]+:([^@]+)@/g,

    // JWT tokens
    /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,

    // Credit card numbers (basic pattern)
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,

    // SSH private key markers
    /ssh-rsa\s+[A-Za-z0-9+/=]+/g,
  ];

  detectSecrets(text: string): boolean {
    for (const pattern of this.secretPatterns) {
      if (pattern.test(text)) {
        return true;
      }
    }
    return false;
  }

  redactSecrets(text: string): string {
    let redacted = text;

    for (const pattern of this.secretPatterns) {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }

    return redacted;
  }

  async confirmSend(command: string, output: string): Promise<boolean> {
    console.log('\n--- Data to be sent to LLM ---');
    console.log('Command:', command);
    console.log('\nOutput (truncated to 500 chars):');
    console.log(output.substring(0, 500));
    if (output.length > 500) {
      console.log(`\n... (${output.length - 500} more characters)`);
    }
    console.log('\n--- End of data ---\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question('Send this data to the LLM? (y/N): ', (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }
}
