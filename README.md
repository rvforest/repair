# repAIr - LLM-Driven Error Fixer CLI

A CLI tool that uses Large Language Models to explain terminal errors and suggest fixes. Unlike rule-based tools, repAIr uses AI to understand any error type and provide intelligent, contextual suggestions.

## Features

- **Intelligent Error Analysis**: Uses LLM to understand and explain any error message
- **Zero Re-execution**: Retrieves command output via Zellij without re-running commands
- **Multiple LLM Providers**: Support for OpenAI, Anthropic (Claude), Google (Gemini), OpenRouter, and local models
- **Privacy-Focused**: Automatic secret detection and redaction before sending data to LLMs
- **Response Caching**: Reduces API costs by caching responses for 24 hours
- **Beautiful Output**: Formatted, colorized output with clear explanations and actionable fixes

## Requirements

- **Node.js** 16.0.0 or higher
- **Zellij** 0.38.0 or higher

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

1. **Install Zellij** (if not already installed):

   ```bash
   # macOS
   brew install zellij

   # Linux
   cargo install zellij
   ```

2. **Start a Zellij session**:

   ```bash
   zellij
   ```

3. **Set up your API key**:

   ```bash
   export REPAIR_API_KEY=your-api-key-here
   export REPAIR_PROVIDER=openai  # or anthropic, google, openrouter, local
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
  "scrollbackLines": 100,
  "cacheEnabled": true,
  "cacheTTL": 86400000,
  "confirmBeforeSend": false
}
```

**Configuration Options:**

- `provider` (string): LLM provider to use
- `apiKey` (string): API key for the provider
- `model` (string, optional): Specific model to use
- `scrollbackLines` (number): Lines of terminal output to analyze (default: 100, max: 1000)
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
```

**Options:**

- `--help`, `-h` - Display help information
- `--version`, `-v` - Display version number
- `--no-cache` - Bypass cache and always make fresh API request
- `--confirm` - Display data before sending to LLM and wait for approval
- `--verbose` - Enable verbose output for troubleshooting
- `--debug` - Enable debug output

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
Info: Running in Zellij session: main
Info: Zellij version: 0.39.2
Info: Using provider: anthropic
Info: Using model: claude-3-5-sonnet-20241022
Info: Retrieving terminal output...
Info: Command: npm start
Info: Output length: 156 chars
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
- Cache key: SHA-256 hash of command + output
- Bypass cache: Use `--no-cache` flag

## Troubleshooting

### "This tool must be run inside a Zellij session"

Make sure you're running the command inside Zellij:

```bash
zellij
repair
```

### "No API key configured"

Set your API key via environment variable:

```bash
export REPAIR_API_KEY=your-key-here
```

Or create a config file at `~/.config/repair/config.json`.

### "Failed to retrieve pane output from Zellij"

Ensure you're using Zellij 0.38.0 or higher:

```bash
zellij --version
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

1. **Detection**: Checks if running inside Zellij session
2. **Retrieval**: Uses `zellij action dump-screen` to get terminal output
3. **Parsing**: Extracts last command and its output
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
│   ├── types/         # TypeScript type definitions
│   ├── zellij/        # Zellij integration
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

- Built for [Zellij](https://zellij.dev)
- Powered by LLMs (OpenAI, Anthropic, Google, and more)
