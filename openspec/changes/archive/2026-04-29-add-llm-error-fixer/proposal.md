# Change: Add LLM-Driven CLI Error Explanation and Fix Suggestion Tool

## Why
Developers frequently encounter cryptic error messages in the terminal and need to manually search documentation, Stack Overflow, or use trial-and-error to understand and fix issues. Traditional tools like `thefuck` use rule-based pattern matching, which requires manual maintenance and cannot adapt to new error types or contexts. An LLM-driven tool can provide contextual explanations and intelligent fix suggestions for any error message by analyzing the full command output.

## What Changes
- Add a new CLI utility (`repair`) that retrieves the last command's output from the terminal
- Integrate with Zellij terminal multiplexer to access pane scrollback without re-running commands
- Use an LLM API to analyze error output and provide explanations and fix suggestions
- Display formatted explanations and suggested fixes to the user
- Support configuration for LLM provider and API keys

## Impact
- Affected specs:
  - `cli-utility` (new capability) - Core CLI interface and command handling
  - `zellij-integration` (new capability) - Terminal multiplexer API integration for retrieving output
  - `llm-analysis` (new capability) - LLM integration for error analysis and fix suggestions
- Affected code:
  - New project scaffolding (no existing code)
  - Will require choosing runtime (Node.js, Rust, Go, or Python)
  - Integration with Zellij plugin API or CLI
  - HTTP client for LLM API calls
