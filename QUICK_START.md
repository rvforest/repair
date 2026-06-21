# Quick Start Guide

Get up and running with repAIr in 5 minutes!

## Prerequisites

1. Install Node.js 16+ (if not already installed):

   ```bash
   # Check version
   node --version
   ```

## Installation

### From source (current setup)

```bash
# Navigate to project directory
cd /home/forest/code/repair

# Install dependencies
npm install

# Build the project
npm run build

# Link globally (makes 'repair' command available)
npm link
```

## Configuration

Set your provider, then store its credential once in `pass` on Linux or WSL:

```bash
export REPAIR_PROVIDER=openai
pass init <your-gpg-id> # only if your password store is not already initialized
repair auth set openai
repair auth status openai
```

The prompt is masked and the entry is stored as `repair/openai`. repAIr does not
install or initialize `pass`, GPG, or pinentry.
`repair auth status` checks stored-entry metadata without decrypting the
credential or invoking pinentry. It reports the backend-neutral
`secure-store` source and identifies the selected backend.

For CI, headless systems, macOS, Windows, or Linux systems without `pass`, use
an environment variable instead:

### OpenAI (GPT-4)

```bash
export REPAIR_PROVIDER=openai
export REPAIR_API_KEY=sk-your-openai-key-here
```

### Anthropic (Claude)

```bash
export REPAIR_PROVIDER=anthropic
export REPAIR_API_KEY=sk-ant-your-anthropic-key-here
```

### Google (Gemini)

```bash
export REPAIR_PROVIDER=google
export REPAIR_API_KEY=AIza-your-google-key-here
```

### OpenRouter

```bash
export REPAIR_PROVIDER=openrouter
export REPAIR_API_KEY=sk-or-your-openrouter-key-here
```

### Local Model (Ollama)

```bash
export REPAIR_PROVIDER=local
export REPAIR_MODEL=llama2
export REPAIR_LOCAL_URL=http://localhost:11434/v1
```

Optional hardening flags:

```bash
export REPAIR_INCLUDE_CWD=false
export REPAIR_MAX_CAPTURE_BYTES=65536
export REPAIR_MAX_PERSISTED_OUTPUT_BYTES=16384
```

## Usage

1. **Install shell integration**:

   ```bash
   # Zsh
   echo 'eval "$(repair init zsh)"' >> ~/.zshrc

   # Bash
   echo 'eval "$(repair init bash)"' >> ~/.bashrc
   ```

2. **Reload your shell config**:

   ```bash
   source ~/.zshrc
   ```

3. **Run a command that errors** (for example):

   ```bash
   npm start
   # Error: Cannot find module 'express'
   ```

4. **Analyze the error**:

   ```bash
   repair
   ```

5. **Get an explanation plus direct fixes or debug steps**:

   ```
    === Repair ===

    Why:
   The Node.js application is trying to import the 'express' module...

    Run now:
     1. npm install express
     2. npm install

    Or debug:
       1. npm ls express
   ```

Only failed commands are persisted for analysis. If the last command succeeds, `repair` will tell you that no failed command is currently available.

## Advanced Usage

### Confirmation Mode (review before sending)

```bash
repair --confirm
```

### Verbose Mode (see what's happening)

```bash
repair --verbose
```

### Bypass Cache

```bash
repair --no-cache
```

### View Help

```bash
repair --help
```

## Persistent Configuration

Create `~/.config/repair/config.json` for non-secret settings:

```json
{
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "cacheEnabled": true
}
```

Do not store `apiKey` in this file. If an older config contains one, run
`repair auth set <provider>` or set `REPAIR_API_KEY`, then remove the `apiKey`
property manually.

## Troubleshooting

### "Shell integration is not configured"

Install and load the shell hooks first:

```bash
eval "$(repair init zsh)"
```

### "No API key configured"

On Linux/WSL, run `repair auth set <provider>` with an initialized `pass`
store. Otherwise set `REPAIR_API_KEY`.

### "The pass password store is not initialized"

Configure `pass` and GPG independently:

```bash
pass init <your-gpg-id>
repair auth set <provider>
```

Alternatively, use `REPAIR_API_KEY`.

### "No captured command output is available yet"

Run a command in the configured shell before calling `repair`.

### "No failed command is currently available for analysis"

Run `repair` immediately after a command that exits non-zero.

### "The last failed command was excluded from capture by default"

repAIr skips a small denylist of high-risk commands such as `sudo`, `pass`, `env`, and `printenv`. This is intentional.

### "The captured session data is invalid"

Refresh the hook setup and capture a new command:

```bash
eval "$(repair init zsh)"
```

## Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- Configure your preferred LLM provider and model
- Try different error scenarios
- Use `--confirm` mode for sensitive outputs
- Review the threat model and pre-release checklist in the README before sharing the tool publicly

Happy debugging!
