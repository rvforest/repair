## 1. Credential Boundaries

- [x] 1.1 Add credential source, result, and typed error definitions for environment, `pass`, missing, unavailable, uninitialized, cancelled, timeout, and backend-failure states
- [x] 1.2 Add a provider-validating `CredentialStore` interface and dependency-injection points so tests never access a developer's real password store
- [x] 1.3 Add shared secret masking and secret-safe error formatting utilities with unit tests

## 2. Pass Backend

- [x] 2.1 Implement Linux/WSL platform detection, absolute `pass` executable discovery, password-store directory resolution, and `.gpg-id` preflight checks
- [x] 2.2 Implement shell-free bounded subprocess execution with fixed argument arrays, capped stdout/stderr, stdin secret transfer, timeout handling, and child termination
- [x] 2.3 Implement provider-scoped existence, get, set, and remove operations at `repair/<provider>`
- [x] 2.4 Classify missing entries, unavailable or uninitialized stores, GPG/pinentry cancellation, timeout, and unexpected backend failures without returning raw subprocess output
- [x] 2.5 Add fake-executable tests covering argument safety, stdin-only secret transfer, output bounds, timeout cleanup, failure classification, and secret non-disclosure

## 3. Credential Resolution

- [x] 3.1 Implement remote-provider resolution in the order nonblank `REPAIR_API_KEY`, provider-scoped `pass` entry, then actionable error
- [x] 3.2 Treat empty and whitespace-only environment values as unresolved and avoid secure-store access when a valid environment value exists
- [x] 3.3 Exempt the local provider from all credential checks and secure-store access
- [x] 3.4 Integrate resolved in-memory credentials with LLM provider construction without adding them to logs, caches, or persisted session state
- [x] 3.5 Add tests for provider isolation, precedence, local-provider behavior, missing credentials, backend failures, and verbose-output non-disclosure

## 4. Authentication CLI

- [x] 4.1 Add the `repair auth` command group and provider argument/default resolution
- [x] 4.2 Implement a dependency-free masked terminal prompt with cancellation and non-interactive safeguards
- [x] 4.3 Implement `repair auth set [provider] [--force]` with backend preflight before prompting and overwrite confirmation
- [x] 4.4 Implement `repair auth status [provider]` with effective source, masked environment values, metadata-only stored-entry checks, and unavailable-state reporting
- [x] 4.5 Implement `repair auth remove [provider]` with graceful handling of missing entries
- [x] 4.6 Add CLI tests for successful lifecycle operations, invalid providers, unavailable platforms/backends, overwrite decisions, cancellation, and rejection of positional secrets

## 5. Plaintext Configuration Migration

- [x] 5.1 Stop merging `apiKey` from `config.json` into runtime configuration while preserving non-secret settings
- [x] 5.2 Reject attempts to save `apiKey` through `ConfigManager.save()`
- [x] 5.3 Detect legacy plaintext `apiKey` properties for credential-requiring operations and emit secret-safe migration guidance
- [x] 5.4 Verify `_capture-session` remains credential-independent and neither uses nor exposes a legacy plaintext value
- [x] 5.5 Add configuration tests for legacy detection, save rejection, environment compatibility, and capture-time behavior

## 6. Documentation and Verification

- [x] 6.1 Update README and quick-start instructions for `repair auth`, provider-scoped `pass` entries, Linux/WSL prerequisites, CI environment variables, and unsupported-platform behavior
- [x] 6.2 Remove documentation examples that recommend plaintext API keys in JSON and add explicit manual migration steps
- [x] 6.3 Run formatting, linting, TypeScript compilation, and the complete test suite
- [x] 6.4 Perform an isolated end-to-end test using disposable `GNUPGHOME` and `PASSWORD_STORE_DIR` locations and confirm no test credential appears in logs or repository files

## 7. Post-review Hardening

- [x] 7.1 Reject symlinked, incorrectly owned, or other-user-writable password-store paths and files
- [x] 7.2 Restore masked-prompt terminal state on stream failures and termination signals
- [x] 7.3 Report stored credential status through metadata checks without decrypting the credential

## 8. Backend-neutral Extensibility

- [x] 8.1 Add backend metadata and replace concrete `pass` resolution/status sources with `secure-store`
- [x] 8.2 Add a platform-aware credential-store factory with Linux `pass` and explicit unavailable macOS/Windows stores
- [x] 8.3 Route resolver and all auth command defaults through the factory
- [x] 8.4 Add tests proving platform selection and backend-independent resolver/status behavior
