## Why

`repair auth status` currently reports only the active provider, which makes it difficult to rediscover credentials already configured on a machine and can hide provider/credential mismatches. The command should provide a compact authentication inventory while retaining targeted provider inspection.

## What Changes

- Make `repair auth status` report every supported remote provider and mark the active provider.
- Keep `repair auth status <provider>` as the targeted single-provider view.
- Report credential sources without decrypting secure-store entries.
- Treat `REPAIR_API_KEY` as a credential only for the active provider because the variable is not provider-scoped.
- Warn after `repair auth set <provider>` when the stored credential is for a provider other than the active provider.

## Capabilities

### New Capabilities

- `auth-provider-inventory`: Authentication status inventory, active-provider marking, and provider mismatch guidance.

### Modified Capabilities

None.

## Impact

- Changes output semantics for `repair auth status` when no provider argument is supplied.
- Affects auth command orchestration, tests, README, and quick-start documentation.
- Does not change credential storage, credential resolution precedence, or secret-handling guarantees.
