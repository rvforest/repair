# Implementation Tasks

## 1. Project Setup
- [x] 1.1 Choose runtime (Node.js/TypeScript recommended for MVP)
- [x] 1.2 Initialize project structure with package.json or equivalent
- [x] 1.3 Configure build tooling (TypeScript compiler, bundler if needed)
- [x] 1.4 Set up testing framework (Jest, Vitest, or equivalent)
- [x] 1.5 Create basic CLI entry point with argument parsing

## 2. Configuration System
- [x] 2.1 Implement config file reading from `~/.config/repair/config.json`
- [x] 2.2 Support XDG_CONFIG_HOME environment variable
- [x] 2.3 Add environment variable overrides (REPAIR_API_KEY, REPAIR_PROVIDER)
- [x] 2.4 Create first-run setup flow for API key and provider configuration
- [x] 2.5 Validate configuration values and provide helpful error messages
- [x] 2.6 Write configuration unit tests

## 3. Zellij Integration
- [x] 3.1 Implement Zellij session detection (check environment variables)
- [x] 3.2 Add Zellij version checking (minimum 0.38.0)
- [x] 3.3 Implement pane output retrieval via `zellij action dump-screen`
- [x] 3.4 Parse Zellij output format to extract plain text
- [x] 3.5 Implement configurable scrollback line limit (default 100 lines)
- [x] 3.6 Create command extraction logic (identify last prompt and command)
- [x] 3.7 Handle multi-line commands with line continuations
- [x] 3.8 Write Zellij integration tests (may require mocking)

## 4. LLM Integration
- [x] 4.1 Create HTTP client module for LLM API requests
- [x] 4.2 Implement OpenAI provider (GPT-4, GPT-3.5-turbo)
- [x] 4.3 Implement Anthropic provider (Claude)
- [x] 4.4 Implement Google Gemini provider (Gemini Pro, Gemini Flash)
- [x] 4.5 Implement OpenRouter provider
- [x] 4.6 Implement local model support (OpenAI-compatible endpoints)
- [x] 4.7 Design system prompt for error analysis and fix suggestions
- [x] 4.8 Implement request payload construction (command + output + context)
- [x] 4.9 Add token limit management and intelligent truncation
- [x] 4.10 Implement JSON response parsing and validation
- [x] 4.11 Add fallback for non-JSON responses
- [x] 4.12 Write LLM integration unit tests

## 5. Privacy and Security
- [x] 5.1 Implement secret pattern detection (regex for API keys, tokens, passwords)
- [x] 5.2 Add secret redaction before sending to LLM
- [x] 5.3 Create optional user confirmation mode (display data before sending)
- [x] 5.4 Write security feature tests

## 6. Response Caching
- [x] 6.1 Design cache key format (hash of command + output)
- [x] 6.2 Implement file-based cache storage in `~/.cache/repair/` or XDG_CACHE_HOME
- [x] 6.3 Add cache expiration logic (default 24-hour TTL)
- [x] 6.4 Implement cache lookup and retrieval
- [x] 6.5 Add `--no-cache` flag to bypass cache
- [x] 6.6 Write cache unit tests

## 7. Error Handling
- [x] 7.1 Handle authentication failures with clear error messages
- [x] 7.2 Handle rate limiting with retry suggestions
- [x] 7.3 Handle network timeouts gracefully
- [x] 7.4 Handle model not available errors
- [x] 7.5 Add error when not running in Zellij
- [x] 7.6 Add error when Zellij not installed
- [x] 7.7 Write error handling tests

## 8. Output Formatting
- [x] 8.1 Implement formatted output display with sections (Explanation, Fixes)
- [x] 8.2 Add syntax highlighting for suggested commands (if supported by terminal)
- [x] 8.3 Make fix suggestions copyable (clear formatting)
- [x] 8.4 Add color/emoji support with fallback for non-supporting terminals
- [x] 8.5 Test output formatting in various terminal environments

## 9. CLI Features
- [x] 9.1 Implement `--help` flag with usage documentation
- [x] 9.2 Implement `--version` flag
- [x] 9.3 Add `--verbose` or `--debug` flag for troubleshooting
- [x] 9.4 Add `--no-cache` flag
- [x] 9.5 Add `--confirm` flag for privacy confirmation mode
- [x] 9.6 Write CLI argument parsing tests

## 10. Documentation
- [x] 10.1 Write README.md with installation instructions
- [x] 10.2 Document configuration options and file format
- [x] 10.3 Add usage examples for common error scenarios
- [x] 10.4 Document supported LLM providers and setup
- [x] 10.5 Create troubleshooting guide
- [x] 10.6 Add contributing guidelines

## 11. Packaging and Distribution
- [x] 11.1 Configure package.json for npm publishing (if Node.js)
- [x] 11.2 Set up executable binary configuration
- [ ] 11.3 Test installation via package manager
- [ ] 11.4 Create release process documentation
- [ ] 11.5 Consider additional distribution methods (Homebrew, cargo, etc.)

## 12. Testing and Validation
- [x] 12.1 Write integration tests for end-to-end flow
- [x] 12.2 Test with various error types (syntax errors, command not found, permission denied)
- [x] 12.3 Test with different shells (bash, zsh, fish)
- [x] 12.4 Validate against all spec requirements
- [x] 12.5 Performance testing for large outputs
- [x] 12.6 Security testing for secret detection and redaction
