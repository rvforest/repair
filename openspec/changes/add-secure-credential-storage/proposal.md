## Why

repAIr currently encourages users to place provider API keys in environment variables or plaintext `config.json`. Interactive Linux and WSL users need a one-time secure setup path that avoids persistent shell exports and plaintext configuration without introducing an insufficiently trusted credential-storage dependency.

## What Changes

- Add secure, provider-scoped credential storage using an existing user-managed `pass` password store on Linux and WSL.
- Add a platform-aware credential-store factory and backend metadata so native macOS and Windows adapters can be added without changing CLI or resolution orchestration.
- Add `repair auth set`, `repair auth status`, and `repair auth remove` commands with masked prompts and output.
- Resolve remote-provider credentials in this order: nonblank `REPAIR_API_KEY`, configured secure backend, actionable error.
- Add bounded, shell-free subprocess handling for `pass`, with secret-safe error classification and no credential values in command arguments.
- **BREAKING**: stop accepting or writing `apiKey` in plaintext configuration and provide explicit migration guidance when a legacy value is detected.
- Keep environment variables as the supported path for CI, headless systems, and platforms without a supported secure backend.
- Defer native macOS and Windows keychain dependencies until they pass a separate provenance and platform review.

## Capabilities

### New Capabilities

- `credential-management`: Secure setup, status, removal, masking, migration guidance, and backend availability behavior.
- `credential-resolution`: Provider credential precedence, platform-selected secure-store lookup behavior, local-provider exemptions, and secret-safe runtime failures.

### Modified Capabilities

None.

## Impact

- Configuration loading and validation can no longer treat plaintext `apiKey` as supported configuration.
- CLI gains an `auth` command group and masked interactive input.
- LLM provider construction receives credentials from a dedicated resolver rather than directly from config loading.
- A backend-neutral credential-store abstraction, platform-aware factory, and `pass` subprocess adapter are added using Node built-ins; no npm authentication dependency is required for the initial backend.
- Documentation and tests must cover Linux/WSL setup, CI environment variables, legacy plaintext migration, subprocess timeout/cancellation, and secret non-disclosure.
