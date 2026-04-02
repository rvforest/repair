# Shell Hook Integration Specification Delta

## ADDED Requirements

### Requirement: Shell Session Capture
The system SHALL capture the most recent command session from supported shell hooks.

#### Scenario: Capture command metadata before execution
- **WHEN** a user runs a command in a supported configured shell
- **THEN** the shell integration records the command text and a start timestamp before the command begins

#### Scenario: Capture command output after execution
- **WHEN** the command completes in a supported configured shell
- **THEN** the shell integration captures the command output and exit code and forwards them to the CLI session writer

#### Scenario: Multi-line command preservation
- **WHEN** the executed command spans multiple lines
- **THEN** the captured session preserves the full command text for analysis

### Requirement: Session State Storage
The system SHALL persist the latest captured command session in a local state file.

#### Scenario: XDG state path
- **WHEN** the session writer persists a captured session
- **THEN** it writes to `${XDG_STATE_HOME:-$HOME/.local/state}/repair/last-session.json`

#### Scenario: Structured session payload
- **WHEN** a session is written
- **THEN** the file contains structured fields for command, output, exit code, and timestamp

#### Scenario: Replace previous session
- **WHEN** a newer command completes
- **THEN** the newly captured session replaces the previous session as the most recent analysis target

### Requirement: Supported Shell Coverage
The system SHALL document and enforce which shells provide reliable capture.

#### Scenario: Supported shell initialization
- **WHEN** the user requests initialization for a required shell
- **THEN** the CLI provides integration for Bash and Zsh

#### Scenario: Deferred shell support
- **WHEN** the user requests initialization for a shell without reliable output capture in the current release
- **THEN** the CLI reports that the shell is not yet supported instead of claiming equivalent functionality