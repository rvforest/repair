# CLI Utility Specification Delta

## CHANGED Requirements

### Requirement: Command Line Interface
The system SHALL provide a `repair` command-line utility that analyzes only sanitized session data.

#### Scenario: Basic invocation after secure shell capture
- **WHEN** the user runs `repair` after their configured shell has captured a command session
- **THEN** the tool reads the latest sanitized session bundle from the local state file and analyzes that bundle

#### Scenario: Shell integration not configured
- **WHEN** the user runs `repair` and no valid sanitized session bundle is available
- **THEN** the tool displays an error message explaining that shell integration must be installed with `repair init <shell>`

#### Scenario: Successful command cleared the session
- **WHEN** the user runs `repair` after a successful command and the stored failure session has been cleared
- **THEN** the tool reports that no failed command is currently available for analysis

#### Scenario: Sensitive command was skipped
- **WHEN** the user runs `repair` after a failed command that matched the default sensitive-command denylist, such as `sudo`, and no newer capturable failure was recorded
- **THEN** the tool reports that the command was excluded from capture by default because it is treated as high-risk for accidental disclosure

### Requirement: Shell Integration Setup
The system SHALL provide a CLI-guided way to install secure shell integration.

#### Scenario: Generate supported shell snippet
- **WHEN** the user runs `repair init zsh` or `repair init bash`
- **THEN** the tool prints a shell snippet that configures secure capture and stdin-based ingestion for that shell

#### Scenario: Internal session ingestion command
- **WHEN** a generated shell snippet invokes the internal session ingestion command
- **THEN** the tool reads captured output from stdin, validates metadata arguments, and stores only a sanitized session bundle in the local state path

## ADDED Requirements

### Requirement: Safe Terminal Display
The system SHALL sanitize untrusted text before displaying it in the terminal.

#### Scenario: Confirmation prompt display
- **WHEN** confirmation mode shows the command and output that will be sent to the LLM
- **THEN** the tool displays only sanitized text with terminal control sequences removed

#### Scenario: Formatted response display
- **WHEN** the tool renders LLM explanations and suggested fixes
- **THEN** it strips or neutralizes unsafe control characters before applying terminal formatting

### Requirement: User Visibility Into Shared Data
The system SHALL make the outbound data boundary understandable to a normal development user.

#### Scenario: Confirmation shows exact sanitized payload
- **WHEN** confirmation mode is enabled before sending data to an LLM provider
- **THEN** the tool shows the exact sanitized command and sanitized output excerpt that would be sent rather than a raw or reconstructed transcript

#### Scenario: Security limitations are documented
- **WHEN** the tool documents shell integration, confirmation mode, or provider use
- **THEN** it describes secret redaction as best-effort, notes that only sanitized bundles are persisted, documents the default sensitive-command skip list including privileged and explicit secret-disclosure commands, and states that the tool is not intended for high-secrecy or regulated environments without additional controls
