# LLM Analysis Specification Delta

## CHANGED Requirements

### Requirement: Error Analysis Request
The system SHALL send properly formatted analysis requests to the LLM.

#### Scenario: Context payload construction
- **WHEN** preparing the LLM request
- **THEN** the tool includes the captured command text, command output, and available shell session metadata such as exit code, shell, cwd, and timestamp in structured format

#### Scenario: Token limit management
- **WHEN** captured output exceeds configurable token limits
- **THEN** the tool truncates output intelligently while preserving the most relevant error content