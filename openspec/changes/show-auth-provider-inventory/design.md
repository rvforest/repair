## Context

The auth command accepts an optional provider. When omitted, all auth operations currently resolve to the configured provider, so `repair auth status` cannot answer the common inventory question: which provider credentials are already configured on this machine? Secure-store status checks already use filesystem metadata and do not decrypt credentials.

## Goals / Non-Goals

**Goals:**

- Make the no-argument status command a compact inventory of all remote providers.
- Clearly identify the active provider.
- Preserve the existing targeted status command and credential non-disclosure guarantees.
- Warn when a newly stored credential does not match the active provider.

**Non-Goals:**

- Detect unloaded shell configuration such as an unapproved `.envrc`.
- Change the active provider automatically when a credential is stored.
- Decrypt or validate stored credentials.
- Add provider-specific environment variable names.

## Decisions

1. `repair auth status` will enumerate the shared remote-provider registry. The current registry is small, and an inventory is more useful than silently checking only the active provider. `repair auth status <provider>` remains the stable targeted form if the registry grows.
2. Inventory checks will run concurrently. Each check remains metadata-only, so the command does not invoke `pass show` or pinentry.
3. The unscoped `REPAIR_API_KEY` applies only to the active provider in inventory output. Applying it to every provider would falsely claim that every provider is configured.
4. The output will be a simple aligned table with the active provider marked in the provider column. Status values retain existing terms: `env`, `secure-store`, `missing`, and `unavailable`.
5. `repair auth set <provider>` will not mutate configuration. If the provider differs from the active provider, it will print a non-fatal note explaining that the credential will not be used until that provider becomes active.

## Risks / Trade-offs

- [The provider registry could become large] → Keep the targeted form stable; the inventory presentation can later show active and configured providers by default while adding an explicit full-list option.
- [Concurrent checks repeat backend preflight work] → Current preflight is bounded local metadata inspection; retain this simple design unless provider count or backend cost grows materially.
- [Environment credential scope could be misunderstood] → Mark only the active provider as `env` and document that `REPAIR_API_KEY` is an active-provider override.
- [Table output is less script-friendly than one line] → Preserve `repair auth status <provider>` unchanged for targeted use and automation.
