# LLM Analysis Specification Delta

## ADDED Requirements

### Requirement: LLM Provider Support
The system SHALL support multiple LLM providers for error analysis.

#### Scenario: OpenAI integration
- **WHEN** user configures OpenAI as provider
- **THEN** the tool uses OpenAI API with configured model (gpt-4, gpt-3.5-turbo, etc.)

#### Scenario: Anthropic integration
- **WHEN** user configures Anthropic as provider
- **THEN** the tool uses Anthropic API with configured Claude model

#### Scenario: Google Gemini integration
- **WHEN** user configures Google as provider
- **THEN** the tool uses Google Generative AI API with configured Gemini model

#### Scenario: OpenRouter integration
- **WHEN** user configures OpenRouter as provider
- **THEN** the tool uses OpenRouter unified API with selected model

#### Scenario: Local model integration
- **WHEN** user configures local model endpoint
- **THEN** the tool uses OpenAI-compatible API format for local models (Ollama, LM Studio)

### Requirement: Error Analysis Request
The system SHALL send properly formatted analysis requests to the LLM.

#### Scenario: Context payload construction
- **WHEN** preparing LLM request
- **THEN** the tool includes command text, output, and optional shell context in structured format

#### Scenario: System prompt design
- **WHEN** constructing LLM request
- **THEN** the tool uses system prompt that requests explanation and actionable fix suggestions

#### Scenario: Response format specification
- **WHEN** requesting analysis
- **THEN** the tool asks LLM to return structured JSON with explanation and fixes array

#### Scenario: Token limit management
- **WHEN** output exceeds configurable token limit
- **THEN** the tool truncates output intelligently (preserve error messages, trim repetitive content)

### Requirement: Response Processing
The system SHALL parse and validate LLM responses.

#### Scenario: Successful analysis response
- **WHEN** LLM returns valid analysis
- **THEN** the tool extracts explanation text and fix suggestions for display

#### Scenario: JSON parsing
- **WHEN** LLM response is received
- **THEN** the tool parses JSON response and validates required fields (explanation, fixes)

#### Scenario: Fallback for non-JSON response
- **WHEN** LLM returns non-JSON formatted response
- **THEN** the tool displays raw response with warning about unexpected format

### Requirement: API Error Handling
The system SHALL handle LLM API errors gracefully.

#### Scenario: Authentication failure
- **WHEN** API key is invalid or missing
- **THEN** the tool displays clear error with instructions to configure API key

#### Scenario: Rate limiting
- **WHEN** API rate limit is exceeded
- **THEN** the tool displays error with suggestion to retry or use different provider

#### Scenario: Network timeout
- **WHEN** API request times out
- **THEN** the tool displays error and suggests checking network connection

#### Scenario: Model not available
- **WHEN** requested model is not accessible
- **THEN** the tool displays error listing available models for that provider

### Requirement: Privacy and Security
The system SHALL protect sensitive information when sending data to LLMs.

#### Scenario: Secret detection
- **WHEN** analyzing output for LLM submission
- **THEN** the tool scans for common secret patterns (API keys, tokens, passwords)

#### Scenario: Secret redaction
- **WHEN** potential secrets are detected
- **THEN** the tool redacts them with placeholders before sending to LLM

#### Scenario: User confirmation option
- **WHEN** configuration enables confirmation mode
- **THEN** the tool displays what will be sent and waits for user approval before making API call

### Requirement: Response Caching
The system SHALL cache LLM responses to reduce API costs and improve performance.

#### Scenario: Cache hit
- **WHEN** identical command and output was analyzed recently
- **THEN** the tool returns cached response without making API call

#### Scenario: Cache expiration
- **WHEN** cached response is older than configurable TTL (default 24 hours)
- **THEN** the tool makes fresh API request and updates cache

#### Scenario: Cache bypass
- **WHEN** user runs with `--no-cache` flag
- **THEN** the tool bypasses cache and always makes fresh API request
