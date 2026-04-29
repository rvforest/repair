# CLI Utility Specification Delta

## CHANGED Requirements

### Requirement: Command Line Interface
The system SHALL provide a `repair` command-line utility that users can invoke from their terminal.

#### Scenario: Basic invocation after shell capture
- **WHEN** the user runs `repair` after their configured shell has captured a command session
- **THEN** the tool reads the latest captured session from the local state file and analyzes it

#### Scenario: Help documentation
- **WHEN** user runs `repair --help` or `repair -h`
- **THEN** the tool displays usage instructions and available options

#### Scenario: Version information
- **WHEN** user runs `repair --version` or `repair -v`
- **THEN** the tool displays the current version number

### Requirement: Context Detection
The system SHALL detect when shell integration is unavailable and provide helpful feedback.

#### Scenario: Shell integration not configured
- **WHEN** the user runs `repair` and no valid captured session is available
- **THEN** the tool displays an error message explaining that shell integration must be installed with `repair init <shell>`

#### Scenario: No command captured yet
- **WHEN** shell integration is installed but no command has been captured yet in the current shell session
- **THEN** the tool explains that there is no command output to analyze yet

#### Scenario: Last command succeeded
- **WHEN** shell integration is installed and the most recent command completed successfully
- **THEN** the tool explains that no command is currently available to analyze and instructs the user to rerun `repair` immediately after a command that produced output they want analyzed

## ADDED Requirements

### Requirement: Shell Integration Setup
The system SHALL provide a CLI-guided way to install shell integration.

#### Scenario: Generate supported shell snippet
- **WHEN** the user runs `repair init zsh` or `repair init bash`
- **THEN** the tool prints a shell snippet that the user can evaluate or add to their shell configuration

#### Scenario: Unsupported shell selection
- **WHEN** the user runs `repair init` with an unsupported shell
- **THEN** the tool exits with an error that lists the supported shell names

#### Scenario: Internal session writer
- **WHEN** a generated shell snippet invokes the internal session writer command
- **THEN** the tool stores the structured command session in the local state path for later analysis