# repAIr - LLM-Driven Error Fixer CLI

A CLI tool that uses Large Language Models to explain terminal errors and suggest fixes. Unlike rule-based tools, repAIr uses AI to understand any error type and provide intelligent, contextual suggestions.

## Features

- **Intelligent Error Analysis**: Uses LLM to understand and explain any error message
- **Zero Re-execution**: Reads the latest captured shell session without re-running commands
- **Shell Hook Setup**: Generates Bash and Zsh integration with `repair init <shell>`
- **Multiple LLM Providers**: Support for OpenAI, Anthropic (Claude), Google (Gemini), OpenRouter, and local models
- **Privacy-Focused**: Automatic secret detection and redaction before sending data to LLMs
- **Response Caching**: Reduces API costs by caching responses for 24 hours
- **Beautiful Output**: Formatted, colorized output with clear explanations and actionable fixes

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

1. **Set up your API key**:

   ```bash
   export REPAIR_API_KEY=your-api-key-here
   export REPAIR_PROVIDER=openai  # or anthropic, google, openrouter, local
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

- `REPAIR_API_KEY` - API key for your LLM provider (required)
- `REPAIR_PROVIDER` - LLM provider to use (default: `openai`)
  - Options: `openai`, `anthropic`, `google`, `openrouter`, `local`
- `REPAIR_MODEL` - Specific model to use (optional, uses provider defaults)
- `REPAIR_LOCAL_URL` - Base URL for local model API (default: `http://localhost:11434/v1`)

### Config File

Create `~/.config/repair/config.json`:

```json
{
  "provider": "anthropic",
  "apiKey": "your-api-key",
  "model": "claude-3-5-sonnet-20241022",
  "cacheEnabled": true,
  "cacheTTL": 86400000,
  "confirmBeforeSend": false
}
```

**Configuration Options:**

- `provider` (string): LLM provider to use
- `apiKey` (string): API key for the provider
- `model` (string, optional): Specific model to use
- `cacheEnabled` (boolean): Enable response caching (default: true)
- `cacheTTL` (number): Cache time-to-live in milliseconds (default: 86400000 = 24 hours)
- `confirmBeforeSend` (boolean): Prompt before sending data to LLM (default: false)

## Supported LLM Providers

### OpenAI

```bash
export REPAIR_PROVIDER=openai
export REPAIR_API_KEY=sk-...
export REPAIR_MODEL=gpt-4-turbo-preview  # optional
```

Default model: `gpt-4-turbo-preview`

### Anthropic (Claude)

```bash
export REPAIR_PROVIDER=anthropic
export REPAIR_API_KEY=sk-ant-...
export REPAIR_MODEL=claude-3-5-sonnet-20241022  # optional
```

Default model: `claude-3-5-sonnet-20241022`

### Google (Gemini)

```bash
export REPAIR_PROVIDER=google
export REPAIR_API_KEY=AIza...
export REPAIR_MODEL=gemini-1.5-pro  # optional
```

Default model: `gemini-1.5-pro`

### OpenRouter

```bash
export REPAIR_PROVIDER=openrouter
export REPAIR_API_KEY=sk-or-...
export REPAIR_MODEL=anthropic/claude-3.5-sonnet  # optional
```

Default model: `anthropic/claude-3.5-sonnet`

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
```

**Options:**

- `--help`, `-h` - Display help information
- `--version`, `-v` - Display version number
- `--no-cache` - Bypass cache and always make fresh API request
- `--confirm` - Display data before sending to LLM and wait for approval
- `--verbose` - Enable verbose output for troubleshooting
- `--debug` - Enable debug output
- `init <shell>` - Print shell integration for a supported shell

## Usage Examples

### Basic Usage

Run a command that errors, then analyze it:

```bash
$ npm start
Error: Cannot find module 'express'

$ repair
═══ Error Analysis ═══

Explanation:
The Node.js application is trying to import the 'express' module, but it's not installed
in your project's node_modules directory. This is a common issue when dependencies haven't
been installed or the package.json is out of sync.

Suggested Fixes:
  1. npm install express
  2. npm install

Additional Context:
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

1. **Secret Detection**: Automatically scans output for common secret patterns (API keys, tokens, passwords)
2. **Automatic Redaction**: Detected secrets are replaced with `[REDACTED]` before sending to LLM
3. **Confirmation Mode**: Use `--confirm` to review data before sending
4. **Local Model Support**: Use local LLMs to keep all data on your machine

**Detected Secret Patterns:**

- API keys (OpenAI, GitHub, Google, etc.)
- AWS credentials
- Private keys (RSA, SSH)
- JWT tokens
- Passwords in URLs
- Credit card numbers

## Caching

repAIr caches LLM responses to reduce API costs and improve performance:

- Cache location: `~/.cache/repair/` (or `$XDG_CACHE_HOME/repair/`)
- Default TTL: 24 hours
- Cache key: SHA-256 hash of command, output, and shell metadata
- Bypass cache: Use `--no-cache` flag

## Troubleshooting

### "Shell integration is not configured"

Install the shell hooks and restart your shell:

```bash
echo 'eval "$(repair init zsh)"' >> ~/.zshrc
source ~/.zshrc
```

### "No API key configured"

Set your API key via environment variable:

```bash
export REPAIR_API_KEY=your-key-here
```

Or create a config file at `~/.config/repair/config.json`.

### "No captured command output is available yet"

Run a command first in the same configured shell session, then invoke `repair`.

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
2. **Capture**: Shell hooks record the command, output, exit code, and timestamp
3. **Retrieval**: `repair` reads the latest session from the XDG state directory
4. **Security**: Scans for and redacts potential secrets
5. **Caching**: Checks cache for previous analysis
6. **Analysis**: Sends to LLM with structured prompt
7. **Display**: Formats and displays explanation and fixes

## Architecture

```
repair/
├── src/
│   ├── cache/         # Response caching
│   ├── config/        # Configuration management
│   ├── llm/           # LLM provider integrations
│   ├── output/        # Output formatting
│   ├── security/      # Secret detection and redaction
│   │   ├── session/       # Captured shell session storage
│   │   ├── shell-hooks/   # Shell integration snippet generation
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

## License

MIT

## Acknowledgments

- Powered by LLMs (OpenAI, Anthropic, Google, and more)
