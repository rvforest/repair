# Design: Security-Hardened Shell Session Capture

## Context
The existing shell-hook architecture improves portability over Zellij, but its current capture flow is too trusting:

- shell hooks collect full command output and persist it before meaningful sanitization
- the internal CLI accepts an output file path and reads that file directly
- session, cache, and config files rely on ambient filesystem permissions
- terminal output and model responses are displayed without stripping control sequences
- output size is not bounded before persistence or request construction

This change keeps the shell-hook approach, but redefines it around data minimization and private local storage.

## Goals / Non-Goals

**Goals:**
- Prevent raw terminal output from being durably persisted by default
- Eliminate arbitrary file-read ingestion from the internal CLI contract
- Bound capture size before persistence, caching, and LLM submission
- Ensure all local state files are private by construction
- Treat captured terminal text and LLM responses as untrusted display data
- Preserve the existing user workflow: run a command, then run `repair`
- Reach a security posture that is appropriate for open source distribution as a normal development tool with clearly documented limits

**Non-Goals:**
- Prevent a malicious process running as the same user from invoking the CLI entirely
- Build end-to-end encrypted local storage or OS keychain integration in this change
- Guarantee perfect secret detection for every provider-specific token format
- Change the user-facing analysis experience beyond safer defaults and clearer configuration
- Position the tool as suitable for highly regulated, high-secrecy, or adversarial multi-user environments

## Release Posture

This change targets a release posture suitable for sharing the project publicly as a normal software development tool. The intended claim is not "safe for every sensitive environment"; it is "designed to minimize local persistence, bound captured data, redact likely secrets, and clearly show what may be sent to a provider."

That release posture depends on all of the following being true:

- only sanitized, size-limited bundles are durably persisted
- shell capture artifacts are private, short-lived, and cleaned up on both normal and abnormal paths
- outbound requests are built only from sanitized fields
- terminal display paths treat captured and model text as untrusted
- documentation describes residual risk, supported shells, and unsupported operating conditions

## Threat Model And Residual Risk

### In scope
- accidental persistence of secrets from terminal output
- oversized capture causing unnecessary disclosure or request amplification
- terminal escape/control-sequence replay from captured output or model responses
- accidental exposure caused by permissive local file permissions or unsafe update patterns
- stale failure state causing the wrong command output to be analyzed
- unintentional persistence of elevated-command output into user-owned local state

### Out of scope
- malicious software already running as the same user
- a compromised shell environment or intentionally hostile shell startup files
- perfect identification of every secret format or sensitive business value
- protection guarantees required by regulated or high-secrecy environments

### Residual risk statement
Even after hardening, some residual confidentiality risk remains because secret detection is heuristic and the tool still stores a sanitized bundle on the local machine long enough to support the "run a command, then run repair" workflow. This residual risk is acceptable for ordinary development use if it is minimized technically and documented explicitly.

## Security Principles

1. **Minimize before persisting**: raw capture is transient; only sanitized, bounded data is stored.
2. **Least privilege on disk**: state, config, and cache paths are created with explicit private permissions.
3. **No path-based ingestion**: the internal capture command accepts bytes from stdin, not arbitrary file paths.
4. **Untrusted text stays untrusted**: terminal data and model output are normalized and escape-stripped before display.
5. **Safe defaults**: cloud-provider caching and cwd inclusion are opt-in when they increase exposure.

## Decisions

### Decision: Persist only failed command sessions
**Why:** The tool is meant to diagnose command failures, so retaining successful output adds local surface area without increasing the quality of the analysis. Clearing the stored session on success also prevents `repair` from analyzing stale failure data after the user has already recovered.

**Policy:**
- failed commands overwrite the previous stored failure session
- successful commands do not persist output and clear any previously stored failure session
- running `repair` after a successful command reports that no failed command is currently available for analysis

### Decision: Use a narrow default sensitive-command denylist
**Why:** Some commands have low diagnostic value for this tool and disproportionately high disclosure risk because their primary purpose is to cross privilege boundaries or print secrets and environment state. `sudo` deserves explicit mention because it is the clearest privilege-boundary example, but it should still be handled as part of one denylist policy rather than as a separate planning track. At the same time, a broad denylist of ordinary Unix text utilities would make the tool feel arbitrary and reduce usefulness for common debugging workflows. The default policy should therefore skip only command classes whose primary purpose is sensitive disclosure, while relying on sanitize-before-persist and failed-only retention for general-purpose commands.

**Policy:**
- skip privilege-boundary entrypoints such as `sudo`, `doas`, and `su`
- skip explicit secret and credential retrieval entrypoints such as `pass`, `op`, `bw`, `vault`, `secret-tool`, and `security`
- skip environment-dump entrypoints such as `env` and `printenv` because they commonly expose tokens and provide little value when analyzed after failure
- skipped sensitive commands do not create temp capture artifacts and do not update the persisted session bundle
- running `repair` after a failed skipped command explains that the command was excluded from capture by default because it belongs to the sensitive-command denylist
- if a future explicit opt-in for denylisted command capture is added, any persisted sanitized bundle remains owned by the invoking user and stored under that user's private XDG state path rather than in a root-owned location
- do not skip broad file and text inspection commands such as `cat`, `less`, `more`, `head`, `tail`, `grep`, `sed`, `awk`, `jq`, or `yq` by default solely because they can display sensitive content
- document the default skip list and allow a future explicit user-configurable denylist if field experience shows additional commands should be excluded

### Decision: Replace raw session storage with a sanitized analysis bundle
**Why:** The main risk is that secrets and other sensitive data are written to disk before the tool can redact them. The new design stores only the subset of captured data that is suitable for analysis.

**Persisted path:**
- `${XDG_STATE_HOME:-$HOME/.local/state}/repair/last-session.json`

**Persisted fields:**
- `command`: sanitized command text
- `output`: sanitized and truncated output excerpt
- `exitCode`
- `timestamp`
- optional `shell`
- optional `cwd` only when explicitly enabled in config
- `truncated`: whether input was reduced before persistence
- `redactionsApplied`: number of redaction operations performed

**Not persisted:**
- raw unsanitized output
- arbitrary environment dumps
- full working directory by default
- file paths to temporary capture files

### Decision: Use private file-backed state instead of environment variables
**Why:** Environment variables are a poor transport and storage mechanism for captured command output. They are size-limited in practice, can be inherited by child processes, are easy to leak into debug logs or crash reports, and are awkward for multi-line terminal output. A private, sanitized state file is a narrower and more debuggable interface for the handoff between shell capture and later CLI analysis.

**Policy:**
- large captured payloads are never passed through environment variables
- shell-to-CLI transfer uses stdin for captured bytes
- delayed CLI analysis reads only the sanitized state bundle from the private XDG state path

### Decision: Clean up temporary capture artifacts on abnormal shell termination
**Why:** Immediate deletion after successful ingestion is necessary but insufficient. Shell exit, terminal closure, or process interruption can leave behind private temp files that should not accumulate or be mistaken for valid analysis state.

**Policy:**
- shell snippets delete the temp artifact immediately after capture ingestion on the normal path
- shell snippets install a best-effort cleanup path for shell exit and interruption where practical for Bash and Zsh
- startup logic may remove stale temp artifacts created by previous interrupted sessions
- orphaned temp artifacts must remain private and must never be treated as authoritative analysis state

### Decision: Use stdin for capture ingestion
**Why:** Accepting `--output-file` allows arbitrary file reads through a public CLI interface. Reading captured bytes from stdin keeps the ingestion boundary narrow and avoids path traversal or file-poisoning behavior in the CLI itself.

**New internal command shape:**
- `repair _capture-session --cmd ... --code ... --ts ... [--cwd ...] [--shell ...]`
- captured output is piped on stdin

**Shell-side flow:**
- the shell may still use a private temporary file or pipe for tee-based capture
- after the command completes, the shell invokes `repair _capture-session ... < "$tmpfile"`
- the CLI never receives a filesystem path from the shell snippet

### Decision: Introduce a capture sanitization pipeline before write or display
**Why:** Secret regexes alone are insufficient. The system needs a deterministic pipeline that reduces both confidentiality and availability risk.

**Pipeline stages:**
1. Read at most `maxCaptureBytes` from stdin
2. Decode as UTF-8 with replacement for invalid byte sequences
3. Strip NUL bytes and ANSI/OSC/control sequences
4. Normalize line endings
5. Apply structured redaction rules to commands, output, and optional cwd
6. Extract the most relevant output window with a tail-biased strategy
7. Persist only the resulting sanitized bundle

**Detection and redaction approach:**
- apply exact-match and structured patterns for known secret families such as provider API keys, access tokens, private key markers, and credential-bearing URLs
- apply carefully bounded heuristic patterns for token-like strings that are high risk and low value to preserve verbatim
- redact command text, output text, and optional cwd independently so one field cannot bypass another field's rules
- track whether truncation or redaction occurred so confirmation and debugging flows can explain why text changed
- design redaction to be deterministic and idempotent so repeated processing does not reintroduce or distort sensitive values

**Default limits:**
- `maxCaptureBytes`: 64 KiB
- `maxPersistedOutputBytes`: 16 KiB
- limits remain configurable, but upper-bounded in validation

### Decision: Make local file handling explicitly private and atomic
**Why:** XDG paths do not guarantee private permissions. The application must create private directories and files regardless of process umask.

**Requirements:**
- state/cache/config directories: mode `0700`
- state/cache/config files: mode `0600`
- writes use temp file + atomic rename within the same directory
- sensitive reads and writes reject symlinks and non-regular files when practical

### Decision: Sanitize terminal display output
**Why:** Terminal control sequences in captured output or LLM responses can manipulate terminal state, paste buffers, or confuse users.

**Display policy:**
- strip ANSI color/control sequences and OSC escape sequences before confirmation prompts
- strip or encode remaining non-printable control characters except `\n` and `\t`
- apply the same sanitization to LLM explanations and suggested fixes before rendering

### Decision: Make high-exposure metadata opt-in
**Why:** `cwd` often contains usernames, organization names, and repository names. It can help analysis, but it is not required for the core workflow.

**Policy:**
- `shell` and `exitCode` remain included by default
- `cwd` is excluded unless `includeCwd` is enabled in config or via future CLI flag
- confirmation mode shows exactly what will be sent after sanitization

### Decision: Restrict caching to sanitized artifacts
**Why:** Cache should not reintroduce the same leakage the capture pipeline is designed to remove.

**Policy:**
- cache keys are derived only from sanitized analysis bundles
- cached payloads store only sanitized requests/responses
- cache files use the same private permission rules as state files
- remote-provider caching defaults to off; local-provider caching may remain on by default

### Decision: Keep provider credentials out of URLs
**Why:** Query-string credentials are more likely to leak into logs and diagnostics.

**Policy:**
- remote providers must send credentials in headers or request bodies, never URL query parameters
- remote providers must require HTTPS unless explicitly documented as local-only endpoints
- local provider HTTP remains allowed for localhost-style development endpoints

## Architecture

```text
┌──────────────────────────────┐
│ User shell hooks             │
│ preexec + precmd / DEBUG     │
└──────────────┬───────────────┘
               │
               │ tee to private temp capture (0600, short-lived)
               v
┌────────────────────────────────────────────┐
│ repair _capture-session                    │
│ - read bounded bytes from stdin            │
│ - strip control sequences                  │
│ - redact secrets                           │
│ - trim to relevant excerpt                 │
│ - atomically write sanitized bundle        │
└──────────────┬─────────────────────────────┘
               │
               v
┌────────────────────────────────────────────┐
│ XDG state: last-session.json               │
│ sanitized, bounded, private, atomic        │
└──────────────┬─────────────────────────────┘
               │
               v
┌────────────────────────────────────────────┐
│ repair CLI                                 │
│ 1. read sanitized bundle                   │
│ 2. optionally confirm exact outbound data  │
│ 3. consult sanitized cache                 │
│ 4. send request to configured provider     │
│ 5. sanitize model text before rendering    │
└────────────────────────────────────────────┘
```

## Data Flow

1. User runs a command in Bash or Zsh.
2. Shell hooks capture the command text and stream output to both the terminal and a private temporary capture file.
3. On command completion, the shell invokes `repair _capture-session` and redirects the temporary capture file to stdin.
4. `_capture-session` reads only up to the configured byte limit, sanitizes and redacts the content, and writes a sanitized analysis bundle atomically to the XDG state path.
5. The shell deletes the temporary capture file immediately after ingestion.
6. When the user runs `repair`, the CLI reads the sanitized bundle, loads config, optionally asks for confirmation, and builds the LLM request only from sanitized fields.
7. The LLM response is sanitized for safe terminal display before formatting.
8. If caching is enabled, only the sanitized request/response pair is stored.

## Detailed Component Changes

### Shell integration
- Set `umask 077` for the temporary capture creation path or equivalent shell-specific private-file behavior.
- Continue skipping `repair` self-invocation to avoid feedback loops.
- Skip privileged or secret-disclosure entrypoint commands from the default denylist before capture begins.
- Preserve existing prompt behavior, but do not pass file paths into the CLI.
- If secure capture setup fails, disable capture for that command rather than leaving redirections half-installed.

### Session store
- Rename the internal model from "captured session" to "sanitized analysis bundle" in code.
- Validation must enforce maximum field lengths in addition to type checks.
- Reads should reject malformed JSON, symlinked files, and oversized files.

### Security filtering
- Split the current `SecurityFilter` into distinct concerns:
  - `TerminalSanitizer` for control-sequence stripping and normalization
  - `SecretRedactor` for deterministic secret replacement
  - `CaptureLimiter` for byte/line bounds and excerpt selection
- Redaction rules should avoid stateful global-regex bugs and track how many replacements were applied.

### CLI and confirmation flow
- Replace `_write-session` with `_capture-session`.
- Remove `--output-file` and any code path that reads an arbitrary user-supplied file.
- Confirmation mode prints only sanitized outbound data.
- Verbose logging prints metadata and lengths, not raw captured payloads.

### LLM providers
- Apply request-size limits before provider invocation.
- Use headers for API keys, including Google provider authentication if supported by the selected API surface.
- Refuse non-HTTPS remote base URLs.

## Risks / Trade-offs

### Trade-off: Reduced context may lower analysis quality
**Decision:** Favor confidentiality over completeness. The default excerpt strategy keeps the most relevant tail content and can be tuned later.

### Risk: Secure capture behavior differs across shells
**Mitigation:** Limit guaranteed support to Bash and Zsh, keep shell snippets small, and document shell-specific caveats.

### Risk: False positive redaction can remove useful debugging context
**Mitigation:** Prefer conservative token replacement with markers like `[REDACTED:AWS_SECRET]` so users can still understand the shape of the data.

### Risk: Local same-user processes can still interfere
**Mitigation:** Private files, smaller trusted interfaces, and atomic writes reduce accidental or opportunistic abuse, even if same-user isolation is not absolute.

### Risk: Sanitized persistence still retains some sensitive context
**Mitigation:** Persist only the bounded sanitized bundle needed for analysis, exclude cwd by default, clear state after successful commands, and document that the tool is meant for ordinary development rather than high-secrecy workloads.

### Risk: Denylisted-command failures are less convenient to analyze
**Mitigation:** Favor conservative defaults for open source release. Document that sensitive commands, including `sudo`, are skipped by design, and reserve any future opt-in capture support for stronger warnings and review.

### Risk: Some sensitive output can still come from allowed general-purpose commands
**Mitigation:** Keep the default skip list narrow to avoid overblocking, but combine it with sanitize-before-persist, failed-only retention, bounded excerpts, and documentation that ordinary file-inspection commands can still expose sensitive data if the user runs them carelessly.

## Release Gates

The change should not be considered ready for general open source sharing until all of the following are true:

1. No raw command output is durably persisted anywhere in normal operation.
2. Session, cache, and config paths use explicit private permissions and atomic writes.
3. Shell capture cleanup works on success paths and has a best-effort strategy for abnormal termination.
4. Confirmation prompts and rendered model output are terminal-safe.
5. Public docs describe the threat model, residual risks, supported shells, and unsupported high-secrecy use.
6. Automated tests cover redaction behavior, size limits, permission handling, temp cleanup, and no-raw-persistence guarantees.

## Migration Plan

1. Introduce the new sanitized analysis bundle schema while preserving the state file location.
2. Replace `_write-session` with `_capture-session` and update generated shell snippets.
3. Add secure file utility helpers and migrate session, cache, and config writes to atomic private writes.
4. Switch request construction and confirmation flows to use sanitized bundle fields only.
5. Update provider implementations and docs to reflect the new security model.
6. Add regression tests for secret leakage, control-sequence stripping, oversized capture, and permissions.

## Open Questions

1. Should the tool keep a short in-memory-only preview of discarded head content for local confirmation without persisting it?
2. Should remote-provider caching be disabled globally, or configurable per provider?
3. Is `cwd` best handled as a boolean opt-in, or should the tool support coarser modes such as basename-only or repo-root-only?
