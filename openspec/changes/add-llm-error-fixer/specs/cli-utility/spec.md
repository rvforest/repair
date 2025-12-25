# CLI Utility Specification Delta

## ADDED Requirements

### Requirement: Command Line Interface
The system SHALL provide a `repair` command-line utility that users can invoke from their terminal.

#### Scenario: Basic invocation
- **WHEN** user runs `repair` in a Zellij pane
- **THEN** the tool retrieves the last command output and analyzes it

#### Scenario: Help documentation
- **WHEN** user runs `repair --help` or `repair -h`
- **THEN** the tool displays usage instructions and available options

#### Scenario: Version information
- **WHEN** user runs `repair --version` or `repair -v`
- **THEN** the tool displays the current version number

### Requirement: Configuration Management
The system SHALL support user configuration for API keys, provider selection, and behavior options.

#### Scenario: First-time setup
- **WHEN** user runs `repair` without existing configuration
- **THEN** the tool prompts for LLM provider and API key and saves to config file

#### Scenario: Configuration file location
- **WHEN** configuration is stored
- **THEN** the tool saves to `~/.config/repair/config.json` or respects `$XDG_CONFIG_HOME`

#### Scenario: Environment variable override
- **WHEN** user sets `REPAIR_API_KEY` environment variable
- **THEN** the tool uses that value instead of config file

#### Scenario: Provider selection
- **WHEN** user configures LLM provider
- **THEN** the tool supports OpenAI, Anthropic, OpenRouter, and local model endpoints

### Requirement: Output Formatting
The system SHALL display analysis results in a clear, readable format.

#### Scenario: Error explanation display
- **WHEN** LLM analysis completes
- **THEN** the tool displays explanation with syntax highlighting and formatting

#### Scenario: Fix suggestions display
- **WHEN** LLM provides fix suggestions
- **THEN** the tool displays suggested commands in a copyable format

#### Scenario: Error handling display
- **WHEN** analysis fails (API error, network issue, etc.)
- **THEN** the tool displays a helpful error message with troubleshooting steps

### Requirement: Context Detection
The system SHALL detect when it's running in an unsupported environment and provide helpful feedback.

#### Scenario: Not in Zellij
- **WHEN** user runs `repair` outside of Zellij
- **THEN** the tool displays an error message explaining Zellij is required for MVP

#### Scenario: Zellij not installed
- **WHEN** Zellij is not available in PATH
- **THEN** the tool displays installation instructions for Zellij
