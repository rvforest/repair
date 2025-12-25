# Quick Start Guide

Get up and running with repAIr in 5 minutes!

## Prerequisites

1. Install Zellij (if not already installed):

   ```bash
   # macOS
   brew install zellij

   # Linux with cargo
   cargo install zellij
   ```

2. Install Node.js 16+ (if not already installed):

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

Set up your API key for your preferred LLM provider:

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

## Usage

1. **Start Zellij**:

   ```bash
   zellij
   ```

2. **Run a command that errors** (for example):

   ```bash
   npm start
   # Error: Cannot find module 'express'
   ```

3. **Analyze the error**:

   ```bash
   repair
   ```

4. **Get explanation and fixes**:

   ```
   ═══ Error Analysis ═══

   Explanation:
   The Node.js application is trying to import the 'express' module...

   Suggested Fixes:
     1. npm install express
     2. npm install
   ```

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

Create `~/.config/repair/config.json` to avoid setting environment variables each time:

```json
{
  "provider": "anthropic",
  "apiKey": "your-api-key-here",
  "model": "claude-3-5-sonnet-20241022",
  "scrollbackLines": 100,
  "cacheEnabled": true
}
```

## Troubleshooting

### "This tool must be run inside a Zellij session"

Make sure you start Zellij first:

```bash
zellij
repair
```

### "No API key configured"

Set the REPAIR_API_KEY environment variable or create a config file.

### "Failed to retrieve pane output"

Ensure you're using Zellij 0.38.0 or higher:

```bash
zellij --version
```

## Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- Configure your preferred LLM provider and model
- Try different error scenarios
- Use `--confirm` mode for sensitive outputs

Happy debugging!
