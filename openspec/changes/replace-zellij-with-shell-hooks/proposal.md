# Change: Replace Zellij Integration With Shell Hooks

## Why
The current product and spec assume the CLI can only inspect terminal output when it is running inside Zellij. That creates an unnecessary runtime dependency, blocks users who do not use a terminal multiplexer, and leaks an implementation detail into the CLI contract. The shell already knows which command ran, when it started, and what output it produced, so the more portable design is to capture that data at the shell boundary and persist it for the CLI to read.

## What Changes
- Replace Zellij-based pane inspection with shell hook integration that writes the last command session to an XDG state file
- Add `repair init <shell>` so users can install shell integration snippets from the CLI instead of managing raw scripts by hand
- Add an internal session writer/reader flow so shell snippets can call back into the CLI without external tools like `jq`
- Update CLI behavior to explain missing shell integration or missing captured session data instead of requiring Zellij
- Remove Zellij-specific docs, setup guidance, error messages, and package metadata
- Invalidate the `zellij-integration` capability and replace it with `shell-hook-integration`

## Impact
- Affected specs:
  - `cli-utility` (modified) - CLI setup and runtime expectations change from Zellij detection to shell integration setup
  - `shell-hook-integration` (new) - Defines shell snippet generation, failed-session capture, state cleanup, and state file retrieval
  - `zellij-integration` (removed) - The previous terminal multiplexer requirement is no longer part of the product
  - `llm-analysis` (modified) - Analysis input is sourced from captured failed shell session data, including exit metadata when available
- Affected code:
  - `src/zellij/` and all Zellij-specific entrypoint logic will be removed or replaced
  - CLI argument handling will gain `init` and internal session-writing subcommands
  - New session storage and shell snippet modules will be added
  - README, quick start, and troubleshooting docs will need new setup instructions