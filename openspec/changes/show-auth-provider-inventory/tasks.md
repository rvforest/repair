## 1. Status Inventory

- [x] 1.1 Add active-provider-aware credential status checks that can ignore the unscoped environment credential
- [x] 1.2 Make no-argument `repair auth status` render all remote providers concurrently and mark the active provider
- [x] 1.3 Preserve explicit single-provider status output and add inactive-provider guidance after credential storage

## 2. Verification and Documentation

- [x] 2.1 Add tests for inventory completeness, active marking, environment scope, local-provider behavior, concurrency, and mismatch guidance
- [x] 2.2 Update README and quick-start documentation with inventory and targeted status behavior
- [x] 2.3 Run type checking and the complete test suite
