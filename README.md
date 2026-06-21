# repAIr - LLM-Driven Error Fixer CLI

A CLI tool that uses Large Language Models to explain terminal errors and suggest direct fixes or debug steps. Unlike rule-based tools, repAIr uses AI to understand any error type and provide intelligent, contextual suggestions.

## Features

- **Intelligent Error Analysis**: Uses LLM to understand and explain any error message
- **Zero Re-execution**: Reads the latest captured shell session without re-running commands
- **Shell Hook Setup**: Generates Bash and Zsh integration with `repair init <shell>`
- **Multiple LLM Providers**: Support for OpenAI, Anthropic (Claude), Google (Gemini), OpenRouter, and local models
- **Privacy-Focused**: Automatic secret detection and redaction before sending data to LLMs
- **Secure Credentials on Linux/WSL**: Stores provider credentials in your existing `pass` password store
- **Response Caching**: Reduces API costs by caching responses for 24 hours
- **Beautiful Output**: Formatted, colorized output with clear explanations, direct fixes, and targeted debug steps

## Requirements

- **Node.js** 16.0.0 or higher
- **Supported shell**: Bash or Zsh

## Installation

### Via npm (when published)

```bash
npm install -g repair
```

### From source

```bash
git clone <repository-url>
cd repair
npm install
npm run build
npm link
```

## Quick Start

1. **Choose your provider and set up authentication**:

   ```bash
   export REPAIR_PROVIDER=openai  # or anthropic, google, openrouter, local
   repair auth set openai         # masked prompt; Linux/WSL with initialized pass
   ```

   For CI, headless systems, or unsupported platforms, use:

   ```bash
   export REPAIR_API_KEY=your-api-key-here
   ```

2. **Install shell integration**:

   ```bash
   # Zsh
   echo 'eval "$(repair init zsh)"' >> ~/.zshrc

   # Bash
   echo 'eval "$(repair init bash)"' >> ~/.bashrc
   ```

3. **Restart your shell** or re-source your shell config:

   ```bash
   source ~/.zshrc
   ```

4. **Run a command that errors**, then run:

   ```bash
   repair
   ```

## Configuration

repAIr can be configured via environment variables or a config file at `~/.config/repair/config.json`.

### Environment Variables

- `REPAIR_API_KEY` - API key override for CI/non-interactive use; takes precedence over `pass`
- `REPAIR_PROVIDER` - LLM provider to use (default: `openai`)
  - Options: `openai`, `anthropic`, `google`, `openrouter`, `local`
- `REPAIR_MODEL` - Specific model to use (optional, uses provider defaults)
- `REPAIR_LOCAL_URL` - Base URL for local model API (default: `http://localhost:11434/v1`)
- `REPAIR_INCLUDE_CWD` - Include sanitized cwd in outbound requests when explicitly set to `true`
- `REPAIR_MAX_CAPTURE_BYTES` - Maximum bytes ingested from shell capture stdin (default: `65536`)
- `REPAIR_MAX_PERSISTED_OUTPUT_BYTES` - Maximum sanitized output bytes retained for analysis (default: `16384`)

### Config File

Create `~/.config/repair/config.json`:

```json
{
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "cacheEnabled": true,
  "cacheTTL": 86400000,
   "confirmBeforeSend": false,
   "includeCwd": false,
   "maxCaptureBytes": 65536,
   "maxPersistedOutputBytes": 16384
}
```

**Configuration Options:**

- `provider` (string): LLM provider to use
- `model` (string, optional): Specific model to use
- `cacheEnabled` (boolean): Enable response caching (default: true)
- `cacheTTL` (number): Cache time-to-live in milliseconds (default: 86400000 = 24 hours)
- `confirmBeforeSend` (boolean): Prompt before sending data to LLM (default: false)
- `includeCwd` (boolean): Opt in to including sanitized cwd in outbound requests (default: false)
- `maxCaptureBytes` (number): Bound stdin capture size before persistence (default: 65536)
- `maxPersistedOutputBytes` (number): Bound sanitized output retained for analysis (default: 16384)

## Supported LLM Providers

On Linux and WSL, initialize [`pass`](https://www.passwordstore.org/) with your
GPG key, then store a credential once:

```bash
pass init <your-gpg-id>
repair auth set openai
repair auth status openai
```

repAIr stores entries as `repair/<provider>`. It does not install or initialize
`pass`, GPG, pinentry, or keys. Environment variables remain the supported path
for CI, macOS, Windows, and systems without an initialized `pass` store.
Credential orchestration is backend-neutral: Linux/WSL currently selects
`pass`, while planned macOS Keychain and Windows Credential Manager adapters
can be added through the platform store factory.

### OpenAI

```bash
export REPAIR_PROVIDER=openai
export REPAIR_API_KEY=sk-...
export REPAIR_MODEL=gpt-5.4-mini  # optional
```

Default model: `gpt-5.4-mini`

### Anthropic (Claude)

```bash
export REPAIR_PROVIDER=anthropic
export REPAIR_API_KEY=sk-ant-...
export REPAIR_MODEL=claude-haiku-4-5-20251001  # optional
```

Default model: `claude-haiku-4-5-20251001`

### Google (Gemini)

```bash
export REPAIR_PROVIDER=google
export REPAIR_API_KEY=AIza...
export REPAIR_MODEL=gemini-2.5-flash-lite  # optional
```

Default model: `gemini-2.5-flash-lite`

### OpenRouter

```bash
export REPAIR_PROVIDER=openrouter
export REPAIR_API_KEY=sk-or-...
export REPAIR_MODEL=anthropic/claude-haiku-4-5-20251001  # optional
```

Default model: `anthropic/claude-haiku-4-5-20251001`

### Local Models (Ollama, LM Studio)

```bash
export REPAIR_PROVIDER=local
export REPAIR_MODEL=llama2
export REPAIR_LOCAL_URL=http://localhost:11434/v1
```

Note: Local models require an OpenAI-compatible API endpoint.

## CLI Options

```bash
repair [options]
repair init <bash|zsh>
repair auth set [provider] [--force]
repair auth status [provider]
repair auth remove [provider]
```

**Options:**

- `--help`, `-h` - Display help information
- `--version`, `-v` - Display version number
- `--no-cache` - Bypass cache and always make fresh API request
- `--confirm` - Display data before sending to LLM and wait for approval
- `--verbose` - Enable verbose output for troubleshooting
- `--debug` - Enable debug output
- `init <shell>` - Print shell integration for a supported shell
- `auth set [provider]` - Store or replace a provider credential using a masked prompt
- `auth status [provider]` - Show `env` or `secure-store` plus the selected backend; environment values are masked and stored entries are checked without decryption
- `auth remove [provider]` - Remove a provider credential from the selected secure store

## Credential Resolution and Migration

Remote-provider credentials resolve in this order:

1. A nonblank `REPAIR_API_KEY`
2. The provider entry in the platform-selected secure store (`pass` on Linux/WSL)
3. An actionable configuration error

The local provider does not require a credential. Empty or whitespace-only
`REPAIR_API_KEY` values fall through to the selected secure store.

Plaintext `apiKey` values in `~/.config/repair/config.json` are no longer
supported. To migrate:

1. Run `repair auth set <provider>` on Linux/WSL, or configure `REPAIR_API_KEY`.
2. Remove the `apiKey` property from the JSON file.

repAIr never migrates or displays the legacy plaintext value automatically.

## Usage Examples

### Basic Usage

Run a command that errors, then analyze it:

```bash
$ npm start
Error: Cannot find module 'express'

$ repair
=== Repair ===

Why:
The command failed because the `express` dependency is missing from this project's installed packages.

Run now:
  1. npm install express
  2. npm install

Or debug:
   1. npm ls express

Note:
Make sure express is listed in your package.json dependencies.
```

### With Confirmation Mode

```bash
$ repair --confirm

--- Data to be sent to LLM ---
Command: npm start
Output: Error: Cannot find module 'express'
...
--- End of data ---

Send this data to the LLM? (y/N): y
```

### Verbose Mode

```bash
$ repair --verbose
Info: Captured command: npm start
Info: Captured output length: 156 chars
Info: Captured shell: zsh
Info: Exit code: 1
Info: Using provider: anthropic
Info: Using model: claude-3-5-sonnet-20241022
Info: Analyzing error with LLM...
```

## Privacy & Security

repAIr includes built-in security features to protect sensitive information:

1. **Sanitize Before Persistence**: The shell hook writes only a bounded, sanitized failure bundle to XDG state
2. **Automatic Redaction**: Detected secrets are deterministically replaced before persistence, caching, and provider requests
3. **Private Local Storage**: State, config, and cache files are created with explicit private permissions and atomic writes
4. **Sensitive Command Skip List**: High-risk entrypoints such as `sudo`, `doas`, `su`, `pass`, `op`, `bw`, `vault`, `secret-tool`, `security`, `env`, and `printenv` are skipped by default
5. **Terminal-Safe Rendering**: Captured text and model responses are stripped of ANSI, OSC, and other unsafe control sequences before display
6. **Confirmation Mode**: Use `--confirm` to review the exact sanitized payload before it leaves the machine
7. **Local Model Support**: Use local LLMs to keep analysis traffic on your machine

**Supported Secret Detection Strategy:**

- API keys (OpenAI, GitHub, Google, etc.)
- AWS credentials
- Private keys (RSA, SSH)
- JWT tokens
- Passwords in URLs
- Generic token-like strings that are long, mixed, and low-value to preserve verbatim

Redaction is best-effort rather than perfect. repAIr is designed for normal development workflows, not for highly regulated, high-secrecy, or adversarial multi-user environments.

General-purpose inspection commands such as `cat`, `grep`, `sed`, and `jq` are still capturable by default; they are not skipped solely because they can display file contents.

## Threat Model

repAIr is designed to reduce accidental disclosure during routine development work:

- In scope: accidental secret persistence, terminal escape replay, oversized capture, stale failure reuse, and permissive local file modes.
- Out of scope: malicious software already running as the same user, compromised shell startup files, and guarantees required for regulated or high-secrecy environments.
- Residual risk: secret detection is heuristic, and a sanitized failure bundle is still stored locally long enough to support the "run a command, then run repair" workflow.

## Caching

repAIr caches LLM responses to reduce API costs and improve performance:

- Cache location: `~/.cache/repair/` (or `$XDG_CACHE_HOME/repair/`)
- Default TTL: 24 hours
- Cache key: SHA-256 hash of the sanitized command, sanitized output excerpt, and allowed shell metadata
- Cached payloads contain only sanitized request/response data
- Bypass cache: Use `--no-cache` flag

## Troubleshooting

### "Shell integration is not configured"

Install the shell hooks and restart your shell:

```bash
echo 'eval "$(repair init zsh)"' >> ~/.zshrc
source ~/.zshrc
```

### "No API key configured"

On Linux/WSL with an initialized `pass` store:

```bash
repair auth set <provider>
```

For CI, headless use, or unsupported platforms:

```bash
export REPAIR_API_KEY=your-key-here
```

### "No captured command output is available yet"

Run a command first in the same configured shell session, then invoke `repair`.

### "No failed command is currently available for analysis"

The most recent command exited successfully, so repAIr cleared any previously stored failure bundle. Run `repair` immediately after a command that fails.

### "The last failed command was excluded from capture by default"

repAIr skips a narrow denylist of high-risk commands such as `sudo` and `printenv`. This protects against persisting privileged or secret-disclosure output by default.

### "The captured session data is invalid"

Capture a fresh command session or reinstall the shell hooks:

```bash
eval "$(repair init zsh)"
```

### API Rate Limiting

If you hit rate limits, try:

1. Using a different provider
2. Using cached responses (enabled by default)
3. Waiting before retrying

### Network/Timeout Errors

Check your internet connection and try again. For persistent issues, consider using a local model.

## Development

### Building from Source

```bash
npm install
npm run build
```

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

### Formatting

```bash
npm run format
```

## How It Works

1. **Detection**: Checks whether shell integration is configured and a captured session is available
2. **Capture**: Shell hooks record the command, mirror output to a private temp file, and avoid the sensitive-command denylist by default
3. **Ingestion**: `repair _capture-session` reads bounded bytes from stdin, strips control sequences, redacts likely secrets, and clears state for successful commands
4. **Retrieval**: `repair` reads the latest sanitized failure bundle from the XDG state directory
5. **Caching**: Checks the sanitized cache for a previous analysis
6. **Analysis**: Sends only sanitized request fields to the configured provider over HTTPS for remote endpoints
7. **Display**: Sanitizes model output again before formatting and printing it

## Architecture

```
repair/
├── src/
│   ├── cache/         # Response caching
│   ├── config/        # Configuration management
│   ├── llm/           # LLM provider integrations
│   ├── output/        # Output formatting
│   ├── security/      # Secret detection and redaction
│   ├── session/       # Captured shell session storage
│   ├── shell-hooks/   # Shell integration snippet generation
│   ├── types/         # TypeScript type definitions
│   ├── cli.ts         # CLI entry point
│   └── index.ts       # Main orchestration
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## Pre-Release Checklist

- Verify that no raw command output is durably persisted during normal operation.
- Verify that state, config, and cache directories are `0700` and files are `0600`.
- Verify that `repair --confirm` and formatted model output strip terminal control sequences.
- Verify that successful commands clear the stored failure bundle.
- Verify that skipped denylisted commands such as `sudo` do not overwrite an existing non-sensitive failure bundle.
- Verify that public docs still describe the consent boundary, residual risks, and unsupported high-secrecy environments.

## License

MIT

## Acknowledgments

- Powered by LLMs (OpenAI, Anthropic, Google, and more)
