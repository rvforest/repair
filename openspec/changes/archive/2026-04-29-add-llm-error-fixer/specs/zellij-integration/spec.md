# Zellij Integration Specification Delta

## ADDED Requirements

### Requirement: Zellij Session Detection
The system SHALL detect whether it's running inside a Zellij session.

#### Scenario: Inside Zellij session
- **WHEN** the tool runs inside an active Zellij session
- **THEN** the tool detects the session via environment variables (ZELLIJ=1 or ZELLIJ_SESSION_NAME)

#### Scenario: Outside Zellij session
- **WHEN** the tool runs outside Zellij
- **THEN** the tool detects absence of Zellij environment variables and displays appropriate error

### Requirement: Pane Output Retrieval
The system SHALL retrieve the scrollback content from the current Zellij pane.

#### Scenario: Retrieve via Zellij CLI
- **WHEN** the tool needs pane output
- **THEN** the tool executes `zellij action dump-screen` or equivalent command to get pane content

#### Scenario: Configurable output length
- **WHEN** retrieving pane output
- **THEN** the tool retrieves configurable number of lines (default 100, max 1000)

#### Scenario: Output parsing
- **WHEN** pane output is retrieved
- **THEN** the tool extracts plain text content preserving line breaks and formatting

### Requirement: Command Extraction
The system SHALL identify the last executed command from the pane output.

#### Scenario: Parse shell prompt
- **WHEN** analyzing pane output
- **THEN** the tool identifies the last shell prompt and extracts the command that followed

#### Scenario: Multi-line command support
- **WHEN** the last command spans multiple lines
- **THEN** the tool captures the complete command including line continuations

#### Scenario: Command output separation
- **WHEN** command is identified
- **THEN** the tool separates the command text from its output for analysis

### Requirement: Zellij Compatibility
The system SHALL work with supported versions of Zellij.

#### Scenario: Minimum version check
- **WHEN** Zellij is detected
- **THEN** the tool verifies Zellij version is 0.38.0 or higher

#### Scenario: Version mismatch warning
- **WHEN** Zellij version is below minimum
- **THEN** the tool displays a warning about potential compatibility issues
