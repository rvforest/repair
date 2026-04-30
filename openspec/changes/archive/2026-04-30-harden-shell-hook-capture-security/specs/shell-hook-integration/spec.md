# Shell Hook Integration Specification Delta

## CHANGED Requirements

### Requirement: Shell Session Capture
The system SHALL capture the most recent command session from supported shell hooks without exposing raw capture files through the CLI interface.

#### Scenario: Capture command metadata before execution
- **WHEN** a user runs a command in a supported configured shell
- **THEN** the shell integration records the command text and a start timestamp before the command begins

#### Scenario: Skip sensitive-command denylist entries by default
- **WHEN** a user runs a command whose entrypoint matches the default sensitive-command denylist such as `sudo`, `doas`, `su`, `pass`, `op`, `bw`, `vault`, `secret-tool`, `security`, `env`, or `printenv`
- **THEN** the shell integration skips capture for that command and does not create transient capture artifacts or update session state

#### Scenario: Do not over-skip general text inspection commands
- **WHEN** a user runs a general-purpose file or text inspection command such as `cat`
- **THEN** the shell integration does not skip capture solely because the command can display file contents

#### Scenario: Capture command output through stdin ingestion
- **WHEN** the command completes in a supported configured shell
- **THEN** the shell integration forwards the captured output bytes to the CLI session-ingestion command via stdin rather than passing a file path argument

#### Scenario: Cleanup transient capture artifacts
- **WHEN** shell capture uses a temporary file or pipe to mirror command output
- **THEN** the integration creates that artifact with private permissions and deletes it immediately after ingestion completes

#### Scenario: Abnormal shell termination leaves stale transient artifacts
- **WHEN** a shell exits or is interrupted before normal capture cleanup completes
- **THEN** any leftover transient capture artifact remains private, is ignored as analysis state, and is removed by best-effort cleanup on shell exit or subsequent startup

### Requirement: Session State Storage
The system SHALL persist only a sanitized analysis bundle for the latest captured failed command session.

#### Scenario: Sanitize before persistence
- **WHEN** the session ingestion command receives captured output
- **THEN** it strips terminal control sequences, redacts detected secrets, and applies size limits before writing session state

#### Scenario: Private XDG state path
- **WHEN** the sanitized session bundle is written
- **THEN** it is stored at `${XDG_STATE_HOME:-$HOME/.local/state}/repair/last-session.json` with private file permissions

#### Scenario: Replace previous session
- **WHEN** a newer command completes
- **THEN** the newly sanitized session bundle atomically replaces the previous bundle as the most recent analysis target

#### Scenario: Successful command clears stale failure data
- **WHEN** a captured command exits with code `0`
- **THEN** the local state file is removed or otherwise cleared so `repair` does not analyze stale failure data

#### Scenario: Failed sensitive command does not overwrite state
- **WHEN** a command from the default sensitive-command denylist such as `sudo` fails in a configured shell
- **THEN** the tool leaves the existing persisted session bundle unchanged because denylisted commands are excluded from capture by default

## ADDED Requirements

### Requirement: Bounded Capture
The system SHALL bound the amount of captured shell data that can be ingested and persisted.

#### Scenario: Oversized command output
- **WHEN** captured output exceeds the configured capture limit
- **THEN** the ingestion command reads only up to the allowed limit, marks the session as truncated, and persists only the bounded sanitized excerpt

### Requirement: Supported Shell Coverage
The system SHALL document and enforce which shells provide reliable and secure capture.

#### Scenario: Supported shell initialization
- **WHEN** the user requests initialization for a required shell
- **THEN** the CLI provides integration for Bash and Zsh with the secure stdin-based ingestion flow

#### Scenario: Deferred shell support
- **WHEN** the user requests initialization for a shell without reliable secure capture in the current release
- **THEN** the CLI reports that the shell is not yet supported instead of claiming equivalent functionality
