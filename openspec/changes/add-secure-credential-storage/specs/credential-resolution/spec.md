## ADDED Requirements

### Requirement: Credential resolution precedence

For remote providers, the system MUST resolve credentials in the order nonblank `REPAIR_API_KEY`, provider-scoped secure storage, then actionable error.

#### Scenario: Environment overrides secure storage

- **WHEN** both a nonblank `REPAIR_API_KEY` and a stored provider credential exist
- **THEN** the system uses the environment value and does not retrieve the stored value

#### Scenario: Blank environment falls through

- **WHEN** `REPAIR_API_KEY` is empty or contains only whitespace and a stored provider credential exists
- **THEN** the system treats the environment value as unresolved and uses the stored credential

#### Scenario: Stored credential supplies runtime

- **WHEN** no nonblank environment credential exists and `repair/<provider>` can be retrieved
- **THEN** the system reports source `secure-store` and passes that credential in memory to the selected LLM provider

#### Scenario: No credential is available

- **WHEN** neither a nonblank environment value nor a stored provider credential resolves
- **THEN** the operation exits nonzero with instructions for both `repair auth set <provider>` and `REPAIR_API_KEY`

### Requirement: Backend-neutral credential orchestration

The system MUST select default credential storage through one platform-aware factory and MUST keep resolver and auth workflows independent of concrete backend implementations.

#### Scenario: Linux backend selection

- **WHEN** the factory runs on Linux or WSL
- **THEN** it returns the `pass` credential-store adapter

#### Scenario: Planned native backend is not implemented

- **WHEN** the factory runs on macOS or native Windows before its native adapter is available
- **THEN** it returns an explicit unavailable store with platform-specific metadata and recommends `REPAIR_API_KEY`

#### Scenario: Future native adapter

- **WHEN** a macOS Keychain or Windows Credential Manager adapter is added
- **THEN** only the factory mapping and backend implementation need to change; credential resolution and auth command orchestration remain unchanged

### Requirement: Provider isolation

The system MUST resolve secure credentials only from the entry associated with the selected provider.

#### Scenario: Provider switch

- **WHEN** the configured provider changes from OpenAI to Anthropic
- **THEN** the resolver looks up `repair/anthropic` and does not reuse `repair/openai`

#### Scenario: Invalid provider

- **WHEN** credential resolution is requested for a provider outside the supported provider registry
- **THEN** the operation fails before constructing a password-store path or invoking `pass`

### Requirement: Local provider exemption

The system SHALL allow the local provider to operate without an API credential.

#### Scenario: Local provider selected

- **WHEN** the selected provider is `local`
- **THEN** credential resolution does not inspect `REPAIR_API_KEY`, access `pass`, or return a missing-credential error

### Requirement: Runtime backend failure handling

The system MUST distinguish a missing credential from unavailable, cancelled, timed-out, or failed secure-storage access.

#### Scenario: Credential entry is missing

- **WHEN** the provider entry does not exist
- **THEN** the system returns the normal actionable missing-credential error

#### Scenario: GPG access is cancelled

- **WHEN** the user cancels pinentry or GPG credential access
- **THEN** the system reports that secure credential access was cancelled and recommends retrying or using `REPAIR_API_KEY`

#### Scenario: Secure storage times out

- **WHEN** provider credential retrieval exceeds the finite timeout
- **THEN** the system reports a secure-storage timeout without printing raw subprocess output

#### Scenario: Backend is unavailable

- **WHEN** `pass` is unavailable or the password store is uninitialized
- **THEN** the system reports the backend state and recommends environment-variable configuration

### Requirement: Capture path remains credential-independent

The internal shell capture path MUST NOT require or retrieve an API credential.

#### Scenario: Capture without auth setup

- **WHEN** `_capture-session` runs with no environment or stored credential
- **THEN** capture and sanitized persistence proceed without invoking the credential resolver

#### Scenario: Capture with legacy plaintext config

- **WHEN** `_capture-session` reads capture-related configuration from a file that also contains a legacy `apiKey`
- **THEN** it does not expose, persist elsewhere, or use that value during capture

### Requirement: Credential non-disclosure

The system MUST NOT include resolved credential values in logs, verbose output, errors, cache keys, persisted session data, or formatted analysis output.

#### Scenario: Verbose runtime

- **WHEN** analysis runs with verbose or debug output enabled
- **THEN** output may identify the provider and credential source but never includes the credential value

#### Scenario: Provider authentication fails

- **WHEN** the remote provider rejects a resolved credential
- **THEN** the error provides rotation or setup guidance without reproducing the credential
