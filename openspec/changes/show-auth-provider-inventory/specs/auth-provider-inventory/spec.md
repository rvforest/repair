## ADDED Requirements

### Requirement: Provider credential inventory
The system SHALL report an authentication inventory when `repair auth status` is invoked without a provider argument.

#### Scenario: Mixed provider credential state
- **WHEN** OpenAI is active, no OpenAI credential is available, and an OpenRouter secure-store entry exists
- **THEN** the inventory reports OpenAI as active and missing and reports OpenRouter as available from the secure store

#### Scenario: Complete provider registry
- **WHEN** the inventory is requested
- **THEN** it includes every supported remote provider, including providers whose credentials are missing

#### Scenario: Metadata-only inventory
- **WHEN** the inventory checks secure-store credentials
- **THEN** it uses entry-existence metadata without decrypting credential values or invoking interactive pinentry

#### Scenario: Concurrent inventory checks
- **WHEN** the inventory checks multiple remote providers
- **THEN** the provider status checks are initiated concurrently

### Requirement: Active provider identification
The system MUST identify which provider is active in the authentication inventory.

#### Scenario: Default provider is active
- **WHEN** no provider override or file configuration is loaded
- **THEN** the inventory marks OpenAI as the active provider

#### Scenario: Configured provider is active
- **WHEN** a supported remote provider is loaded from environment or file configuration
- **THEN** the inventory marks that provider as active

#### Scenario: Local provider is active
- **WHEN** the local provider is configured
- **THEN** the remote-provider inventory states that local is active without adding local to the credential rows

### Requirement: Environment credential scope
The system MUST associate the unscoped `REPAIR_API_KEY` value only with the active remote provider in inventory output.

#### Scenario: Environment credential with active remote provider
- **WHEN** `REPAIR_API_KEY` is nonblank and OpenRouter is active
- **THEN** OpenRouter reports source `env` and other providers are checked independently for secure-store entries

#### Scenario: Environment credential with active local provider
- **WHEN** `REPAIR_API_KEY` is nonblank and the local provider is active
- **THEN** no remote provider reports source `env`

### Requirement: Targeted provider status
The system SHALL preserve targeted provider inspection through `repair auth status <provider>`.

#### Scenario: Explicit provider
- **WHEN** a user runs `repair auth status openrouter`
- **THEN** only OpenRouter status is reported using the existing single-provider output

### Requirement: Inactive credential guidance
The system SHALL provide non-fatal guidance after storing a credential for a provider other than the active provider.

#### Scenario: Explicit inactive provider stored
- **WHEN** OpenAI is active and a user successfully runs `repair auth set openrouter`
- **THEN** the system confirms storage and notes that OpenRouter is not active

#### Scenario: Active provider stored
- **WHEN** OpenRouter is active and a user successfully stores an OpenRouter credential
- **THEN** the system confirms storage without an inactive-provider note
