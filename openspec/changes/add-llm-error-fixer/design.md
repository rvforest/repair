# Design: LLM-Driven Error Fixer CLI

## Context
This tool aims to help developers quickly understand and fix terminal errors by leveraging LLM capabilities. Unlike rule-based tools like `thefuck`, this approach uses AI to understand context and provide intelligent suggestions for any error type.

The MVP will focus on Zellij integration as it provides a clean plugin API and growing adoption in the developer community. Future iterations can expand to other multiplexers (tmux, screen) or terminal emulators.

## Goals / Non-Goals

**Goals:**
- Provide instant error explanations without re-running commands
- Support any error type through LLM understanding
- Integrate seamlessly with Zellij workflow
- Keep initial implementation simple and focused
- Allow configuration of LLM provider (OpenAI, Anthropic, local models, etc.)

**Non-Goals:**
- Automatic command execution (user must approve/execute fixes)
- Support for all terminal multiplexers in MVP (start with Zellij only)
- Training custom models (use existing LLM APIs)
- GUI or web interface (CLI only)
- Command history analysis (just the last command for MVP)

## Decisions

### Decision: Use Zellij for MVP
**Why:** Zellij provides a modern plugin API with Rust/WASM support and can expose pane data programmatically. It's actively maintained and has good documentation.

**Alternatives considered:**
- **tmux**: More widely adopted but requires parsing `capture-pane` output; more complex API
- **Terminal emulator APIs**: Would require multiple implementations per emulator; too broad for MVP
- **Shell history + re-run**: Doesn't capture full output, has side effects

### Decision: Standalone CLI tool (not a Zellij plugin)
**Why:** A standalone CLI tool (`repair`) is more flexible and easier to develop/debug. It can call Zellij's CLI (`zellij action dump-screen`) to get pane output without needing to be embedded as a plugin.

**Alternatives considered:**
- **Zellij plugin**: More integrated but requires Rust/WASM, harder to test, limited by plugin API
- **Shell function**: Less portable, harder to distribute and configure

### Decision: Runtime choice - Leave open for implementation
**Options to consider during implementation:**
- **Rust**: Fast, memory-safe, good Zellij ecosystem fit, but steeper learning curve
- **Node.js/TypeScript**: Fast development, rich ecosystem for HTTP/JSON, widely known
- **Go**: Single binary, good CLI libraries, fast compilation
- **Python**: Easy prototyping, good for LLM integrations, but distribution/packaging complexity

**Recommendation:** Start with Node.js/TypeScript for rapid MVP development, with option to rewrite in Rust later if performance becomes critical.

### Decision: LLM Provider - Configurable
**Why:** Different users have different preferences and API access. Support multiple providers through configuration.

**Providers to support:**
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- Google (Gemini)
- OpenRouter (unified API)
- Local models via compatible APIs (Ollama, LM Studio)

**Configuration:** Store API keys and provider choice in `~/.config/repair/config.json` or environment variables.

### Decision: Output Retrieval Method
**Approach:** Use `zellij action dump-screen` or query Zellij's plugin system to get the last pane's scrollback.

**Format:** Zellij can output pane content in plain text format, which we'll pass to the LLM with context about the error.

## Architecture

```
┌─────────────────┐
│   User runs:    │
│    $ repair     │
└────────┬────────┘
         │
         v
┌─────────────────────────────────┐
│  repair CLI                     │
│  ┌──────────────────────────┐  │
│  │ 1. Detect Zellij session │  │
│  └──────────┬───────────────┘  │
│             │                   │
│             v                   │
│  ┌──────────────────────────┐  │
│  │ 2. Get pane output via   │  │
│  │    zellij CLI/API        │  │
│  └──────────┬───────────────┘  │
│             │                   │
│             v                   │
│  ┌──────────────────────────┐  │
│  │ 3. Parse last command    │  │
│  │    and its output        │  │
│  └──────────┬───────────────┘  │
│             │                   │
│             v                   │
│  ┌──────────────────────────┐  │
│  │ 4. Send to LLM API       │  │
│  └──────────┬───────────────┘  │
│             │                   │
│             v                   │
│  ┌──────────────────────────┐  │
│  │ 5. Format & display      │  │
│  │    explanation + fixes   │  │
│  └──────────────────────────┘  │
└─────────────────────────────────┘
```

## Data Flow

1. **Input**: User runs `repair` in Zellij pane
2. **Context Gathering**: Tool queries Zellij for current pane scrollback (last N lines, configurable)
3. **Parsing**: Extract the last command prompt and subsequent output (error detection heuristics)
4. **LLM Request**: Send structured prompt with:
   - Command that was run
   - Full output/error message
   - Shell environment context (optional: cwd, shell type)
5. **Response**: LLM returns JSON with:
   - Explanation of what went wrong
   - Suggested fixes (commands to try)
   - Additional context/links
6. **Display**: Format output in terminal with syntax highlighting

## Risks / Trade-offs

### Risk: Zellij API changes
**Mitigation:** Pin to specific Zellij version in docs, monitor Zellij releases, design abstraction layer for pane access

### Risk: LLM API costs
**Mitigation:**
- Use smaller/cheaper models for simple errors (tiered approach)
- Cache common error patterns locally
- Let users configure token limits
- Support local models as alternative

### Risk: Privacy/Security - sending command output to LLM
**Mitigation:**
- Clear documentation about what data is sent
- Option to review/edit before sending
- Pattern-based filtering for secrets (API keys, tokens)
- Support for local/offline LLM options

### Trade-off: Accuracy vs Speed
**Decision:** Favor accuracy for MVP. Use GPT-4/Claude for better explanations even if slower. Can optimize later with smaller models for common cases.

## Migration Plan

N/A - This is a new tool with no existing users or data to migrate.

## Open Questions

1. **Error detection heuristics**: How to reliably identify that the last command failed?
   - Option A: Check exit code (requires shell integration)
   - Option B: Parse output for common error patterns (stderr, "Error:", stack traces)
   - Option C: Always analyze last command output regardless of success/failure

2. **Output length limits**: How many lines of scrollback to capture?
   - Suggestion: Default to last 100 lines, make configurable
   - Consider token limits for LLM context

3. **Prompt engineering**: What system prompt works best for error analysis?
   - Needs testing and iteration
   - Should include: role (helpful debugging assistant), output format (structured), focus (explanation + actionable fixes)

4. **Distribution**: How to package and distribute the tool?
   - npm package for Node.js version
   - Standalone binary for compiled versions
   - Homebrew/apt/cargo for package managers
