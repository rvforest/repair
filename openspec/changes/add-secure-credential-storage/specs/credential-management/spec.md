## ADDED Requirements

### Requirement: Secure credential setup

The system SHALL provide `repair auth set [provider]` to store one API credential in the user's existing `pass` password store under `repair/<provider>`.

#### Scenario: Store credential for configured provider

- **WHEN** a user runs `repair auth set` on Linux or WSL with an initialized `pass` store and enters a credential at the masked prompt
- **THEN** the system stores the credential at `repair/<configured-provider>` and confirms success without displaying the value

#### Scenario: Store credential for explicit provider

- **WHEN** a user runs `repair auth set anthropic`
- **THEN** the system validates `anthropic` and stores the credential at `repair/anthropic`

#### Scenario: Secret is not accepted as an argument

- **WHEN** a user attempts to provide a credential as an additional positional argument or command option
- **THEN** command parsing fails without storing the credential

### Requirement: Backend preflight

The system MUST verify backend availability and initialization before prompting for a credential.

#### Scenario: Pass executable is unavailable

- **WHEN** `repair auth set` cannot resolve a `pass` executable
- **THEN** the command exits nonzero before prompting and recommends `REPAIR_API_KEY` as the supported fallback

#### Scenario: Password store is uninitialized

- **WHEN** `repair auth set` finds no valid `.gpg-id` in the selected password-store directory
- **THEN** the command exits nonzero before prompting and explains that the user must initialize `pass` independently

#### Scenario: Password store path is not trusted

- **WHEN** the password-store root, recipient configuration, credential directory, or credential entry is symlinked, owned by another user, or writable by other users
- **THEN** the operation exits nonzero without reading or writing a credential

#### Scenario: Unsupported platform

- **WHEN** secure setup is requested on a platform without a supported credential backend
- **THEN** the command exits nonzero before prompting and recommends environment-variable configuration

### Requirement: Masked interactive input

The system MUST read credentials interactively with terminal echo disabled and MUST NOT print the entered value.

#### Scenario: Interactive credential entry

- **WHEN** the command prompts for a credential in a terminal
- **THEN** typed credential characters are not echoed and the credential is sent to `pass` through standard input

#### Scenario: Non-interactive credential setup

- **WHEN** credential setup requires input but stdin is not an interactive terminal
- **THEN** the command exits nonzero without attempting to read or store a credential

#### Scenario: User cancels input

- **WHEN** the user cancels the masked prompt
- **THEN** the command exits without changing the stored credential or displaying partial input

#### Scenario: Prompt is interrupted

- **WHEN** credential input receives a stream failure or process termination signal
- **THEN** the system restores the terminal's previous raw-mode and paused state before failing or propagating termination

### Requirement: Controlled overwrite

The system MUST require explicit confirmation before replacing an existing provider credential unless `--force` is supplied.

#### Scenario: Interactive overwrite accepted

- **WHEN** an entry exists and the user confirms the `[y/N]` overwrite prompt
- **THEN** the system replaces the entry using the newly entered credential

#### Scenario: Interactive overwrite declined

- **WHEN** an entry exists and the user declines or submits the default overwrite response
- **THEN** the command exits without prompting for or changing the credential

#### Scenario: Forced overwrite

- **WHEN** an entry exists and the user invokes `repair auth set <provider> --force`
- **THEN** the system skips overwrite confirmation but still obtains the secret through masked interactive input

### Requirement: Credential status

The system SHALL provide `repair auth status [provider]` and MUST report credential availability and effective source without decrypting stored credentials.

#### Scenario: Environment credential is effective

- **WHEN** a nonblank `REPAIR_API_KEY` is set
- **THEN** status reports source `env` and displays a masked value without reading or displaying the `pass` entry

#### Scenario: Pass credential is effective

- **WHEN** no nonblank environment credential exists and the provider entry exists
- **THEN** status reports source `pass` without invoking `pass show`, decrypting the entry, or displaying any part of its value

#### Scenario: Credential cannot be accessed

- **WHEN** backend access times out, is cancelled, or otherwise fails
- **THEN** status reports an unavailable state without printing raw backend output or any credential value

### Requirement: Credential removal

The system SHALL provide `repair auth remove [provider]` to remove the provider-scoped entry from `pass`.

#### Scenario: Remove stored credential

- **WHEN** a stored provider credential exists and the user runs `repair auth remove <provider>`
- **THEN** the system removes `repair/<provider>` and confirms removal without displaying the value

#### Scenario: Remove missing credential

- **WHEN** no stored entry exists for the selected provider
- **THEN** the command reports that no credential was stored and exits without treating the condition as an internal failure

### Requirement: Secret-safe subprocess execution

The system MUST invoke `pass` without a shell, MUST keep credential values out of arguments and environment variables, and MUST bound subprocess execution and output.

#### Scenario: Store subprocess invocation

- **WHEN** the system stores a credential
- **THEN** it invokes an absolute `pass` executable with fixed arguments and sends the credential only through child stdin

#### Scenario: Backend timeout

- **WHEN** a `pass` or GPG operation exceeds the configured finite timeout
- **THEN** the system terminates the child process and returns a typed timeout error without exposing captured output

#### Scenario: Backend emits sensitive output

- **WHEN** a backend operation writes stdout or stderr
- **THEN** the system treats successful retrieval stdout as secret material and does not echo raw subprocess output in logs or user-facing errors

### Requirement: Plaintext configuration is rejected

The system MUST NOT load or save API credentials from `config.json`.

#### Scenario: Legacy plaintext key is present

- **WHEN** `config.json` contains an `apiKey` property during a credential-requiring operation
- **THEN** the system ignores the value and exits with guidance to configure `repair auth set` or `REPAIR_API_KEY` and remove the plaintext property

#### Scenario: Save attempts to persist a key

- **WHEN** application code attempts to save an `apiKey` property through configuration management
- **THEN** the save operation is rejected and no credential is written

#### Scenario: Migration guidance is secret-safe

- **WHEN** the system reports a legacy plaintext credential
- **THEN** the message identifies the configuration file and migration actions without displaying the credential
