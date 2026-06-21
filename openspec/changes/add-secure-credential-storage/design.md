## Context

repAIr currently merges `REPAIR_API_KEY` and `apiKey` from `~/.config/repair/config.json` into one `Config.apiKey` value. The environment path is appropriate for CI but inconvenient for interactive use, while the JSON path persists a bearer credential in plaintext.

The first secure-storage target is Linux and WSL, where the intended users already have or can independently configure `pass` and GnuPG. The spike in `spike-pass-credential-backend.md` verified provider-scoped storage, replacement, retrieval, removal, owner-only file modes, stdin-based secret insertion, and relevant failure modes using a fully disposable store.

Credential handling crosses configuration, CLI prompting, provider construction, subprocess management, errors, tests, and documentation. It therefore needs an isolated abstraction rather than additional branches inside `ConfigManager`.

## Goals / Non-Goals

**Goals:**

- Give Linux and WSL users a one-time secure setup using their existing `pass` store.
- Preserve nonblank `REPAIR_API_KEY` as the highest-priority source for CI and explicit overrides.
- Eliminate supported plaintext API-key storage in `config.json`.
- Keep secrets out of command arguments, logs, errors, shell history, and status output.
- Make backend failures bounded, classified, actionable, and testable.
- Avoid adding an npm credential-storage dependency in the initial release.

**Non-Goals:**

- Installing or initializing `pass`, GnuPG, keys, agents, or pinentry for the user.
- Supporting plaintext, null, or repository-owned encrypted-file fallbacks.
- Synchronizing or backing up the user's password store.
- Adding native macOS Keychain or Windows Credential Manager support in this change.
- Supporting arbitrary credential names or multiple credentials per provider.
- Automatically migrating a plaintext key into `pass`.

## Decisions

### Add a credential resolver separate from configuration

`ConfigManager` will load non-secret settings such as provider and model. A new credential resolver will accept the selected provider and resolve an effective credential after configuration is known.

```text
ConfigManager ──> provider/model
                      │
                      ▼
REPAIR_API_KEY ──> CredentialResolver ──> Config with in-memory apiKey
                      ▲
                      │
             CredentialStoreFactory
                  ├── Linux/WSL ──> PassCredentialStore
                  ├── macOS ──────> unavailable until Keychain adapter lands
                  └── Windows ────> unavailable until Credential Manager adapter lands
```

The in-memory `Config.apiKey` can remain as the provider-construction boundary, but it will no longer be populated from JSON. This minimizes provider changes while separating persistent secret handling from ordinary configuration.

Alternative considered: make every LLM provider resolve its own credentials. Rejected because it duplicates precedence and error behavior and makes secret handling harder to audit.

### Select secure storage through one platform-aware factory

Runtime resolution and all auth commands will obtain their default store through `createCredentialStore()`. Stores expose backend-neutral lifecycle operations plus metadata containing a stable backend identifier, display name, and optional setup guidance.

Public resolution/status sources use `secure-store`, not a concrete backend name. Backend metadata is used only for diagnostics and confirmation output. Linux selects `PassCredentialStore`; macOS and Windows select explicit unavailable stores until their native adapters are implemented.

Alternative considered: instantiate `PassCredentialStore` directly and refactor when another backend is added. Rejected because macOS and Windows support is planned, and delaying the selection boundary would require changing resolver, CLI, status, errors, and tests at the same time as introducing security-sensitive native adapters.

### Use provider-scoped `pass` entries

Entries will use the stable path `repair/<provider>`, where provider is validated against the existing `LLMProvider` union before path construction. Examples include `repair/openai` and `repair/anthropic`.

Alternative considered: store the generic environment variable name. Rejected because this application already has a small explicit provider registry, and provider-scoped entries prevent accidental reuse when switching providers.

### Use only Node built-ins for the initial backend

The adapter will use `child_process.spawn` with an absolute executable discovered from `PATH`, a fixed argument array, `shell: false`, bounded stdout/stderr, and a timeout. Secret values will be written to child stdin only.

The initial release will not depend on `keytar`, `@napi-rs/keyring`, or a JavaScript wrapper around `pass`. Native keychain support remains possible through the same `CredentialStore` interface after a separate dependency and provenance review.

Alternative considered: use a cross-platform native npm package immediately. Rejected because this critical path would inherit a native-binary supply chain and platform behavior that has not yet been validated to the required standard.

### Require a user-managed, initialized password store

Before prompting for a credential, `repair auth set` will verify that:

- the platform is Linux or WSL-compatible;
- a `pass` executable can be resolved;
- the selected password-store directory contains a valid `.gpg-id`;
- the store path is not symlinked, is owned by the current user, and is not writable by other users;
- `.gpg-id` and existing credential paths are current-user-owned regular files in trusted directories;
- the target provider is remote and supported.

repAIr will not run `pass init`, create GPG keys, select recipients, or alter agent configuration. Failures will point users to `pass` documentation or the environment-variable path.

### Define explicit credential precedence

For remote providers:

1. A nonblank `REPAIR_API_KEY`.
2. The provider entry in the platform-selected secure store.
3. An actionable missing-credential error.

Whitespace-only environment values are unresolved. The local provider bypasses credential resolution entirely.

There is no plaintext-config fallback. This avoids a secure-looking feature that silently retains the old insecure path.

### Treat subprocess behavior as a security boundary

The `PassCredentialStore` will return typed results rather than raw subprocess failures:

- backend unavailable;
- backend uninitialized;
- credential missing;
- access cancelled;
- operation timed out;
- backend failure.

Subprocess output will be capped. Successful `show` stdout is secret material and must never be logged. Stderr may be inspected internally for classification but must not be echoed directly. Timeout handling will terminate the child, close stdin, and apply a forced-kill grace period if needed.

Normal credential access may permit an interactive pinentry within a bounded timeout. Tests will inject a fake executable and clock rather than access a developer's real store.

### Keep confirmation and prompting inside repAIr

`repair auth set [provider]` will:

1. Resolve the provider from its optional argument or configured provider.
2. Complete backend preflight before asking for a secret.
3. Require `[y/N]` confirmation when an entry already exists unless `--force` is supplied.
4. Prompt with terminal echo disabled.
5. Invoke `pass insert --multiline --force repair/<provider>` and send the value through stdin.

A secret positional argument or flag will not exist. Non-interactive invocation will fail before prompting unless the operation requires no secret.

`repair auth remove [provider]` will call the selected backend only after confirming the provider entry exists. `repair auth status [provider]` will report effective source (`env`, `secure-store`, `missing`, or `unavailable`) and identify the selected backend by display name. Environment credentials are masked; stored credentials are reported by existence metadata without decrypting the value.

### Reject legacy plaintext keys

If parsed `config.json` contains its own `apiKey` property, normal credential-requiring operations will reject it with guidance to:

1. store the credential with `repair auth set [provider]` or configure `REPAIR_API_KEY`;
2. remove `apiKey` from the file.

The value will never be printed or automatically passed to `pass`. `ConfigManager.save()` will reject attempts to persist `apiKey`. Capture-time configuration can continue without credential resolution, but it must not copy or expose the legacy value.

## Risks / Trade-offs

- [Linux/WSL-only secure backend in the initial release] → Keep environment variables fully supported and design the store interface for later audited native adapters.
- [Backend-specific assumptions leak into orchestration] → Route every default store through one factory and expose backend-neutral sources plus backend metadata.
- [GPG agent or pinentry can block] → Apply bounded execution, process termination, and typed timeout/cancellation errors.
- [`pass` error text is not a stable API] → Use preflight filesystem checks for executable/store/entry state and keep stderr matching narrow and covered by tests.
- [Credential status could unnecessarily expose secrets in memory or trigger pinentry] → Use preflight and entry existence checks; never decrypt a stored credential for status.
- [Masked input can be interrupted while terminal echo is disabled] → Restore prior terminal state on completion, cancellation, stream errors, and termination signals before propagating termination.
- [Secrets necessarily exist briefly in Node memory and child stdin] → Keep lifetime narrow, avoid copies where practical, never log values, and release references after use.
- [Rejecting plaintext config is disruptive] → Provide explicit migration instructions and preserve env-var compatibility; do not silently downgrade.
- [PATH executable substitution] → Resolve the executable once, invoke the absolute path without a shell, and document that repAIr trusts the user's execution environment similarly to other CLI tooling.

## Migration Plan

1. Introduce the credential-store and resolver abstractions with fake-backend tests.
2. Add `pass` preflight and lifecycle operations.
3. Add auth commands and secret-safe prompts.
4. Switch runtime resolution to environment then secure store.
5. Reject legacy plaintext `apiKey` loading and saving with migration guidance.
6. Update documentation to remove examples that store keys in JSON.
7. Verify no credential access occurs in `_capture-session`.

Rollback may restore env-only credential resolution, but must not restore plaintext-config support once users have been told it is unsafe.

## Open Questions

- The implementation should select and document a concrete normal-operation timeout after tests with common GPG/pinentry setups; it must remain finite.
- Native macOS and Windows backends require a separate proposal or follow-up change after dependency provenance and platform behavior are validated.
