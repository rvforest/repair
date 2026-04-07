# LLM Analysis Specification Delta

## CHANGED Requirements

### Requirement: Error Analysis Request
The system SHALL send properly formatted analysis requests built from sanitized, bounded session data.

#### Scenario: Context payload construction
- **WHEN** preparing the LLM request
- **THEN** the tool includes the sanitized command text, sanitized output excerpt, and available safe shell metadata such as exit code, shell, timestamp, and opt-in cwd in structured format

#### Scenario: Token and byte limit management
- **WHEN** captured output exceeds configurable token or byte limits
- **THEN** the tool truncates output before persistence and provider invocation while preserving the most relevant error content

### Requirement: Privacy and Secret Handling
The system SHALL minimize and sanitize data before it is sent to an LLM provider.

#### Scenario: Secret redaction before outbound request
- **WHEN** the captured session contains detected secrets or credentials
- **THEN** the tool redacts them before building the outbound LLM request

#### Scenario: Best-effort redaction metadata
- **WHEN** sanitization removes or truncates captured content before request construction
- **THEN** the tool preserves enough metadata in the sanitized bundle or user-visible flow to explain that redaction and truncation occurred without re-exposing the removed content

#### Scenario: No raw session persistence requirement
- **WHEN** the tool prepares data for analysis
- **THEN** it uses the sanitized persisted session bundle and does not require a raw persisted transcript

## ADDED Requirements

### Requirement: Provider Transport Security
The system SHALL avoid insecure transport patterns for provider credentials.

#### Scenario: Remote provider authentication
- **WHEN** the tool authenticates to a remote LLM provider
- **THEN** it sends credentials in headers or request bodies rather than URL query parameters

#### Scenario: Remote provider endpoint validation
- **WHEN** the configured provider endpoint is remote
- **THEN** the tool requires HTTPS unless the provider is explicitly marked as local-only

### Requirement: Safe Response Rendering
The system SHALL treat model responses as untrusted text.

#### Scenario: Response sanitization before render
- **WHEN** a provider returns an explanation or suggested fixes
- **THEN** the tool sanitizes the response for terminal-safe display before formatting it for the user
