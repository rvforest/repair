# Implementation Tasks

## 1. Harden capture ingestion
- [x] 1.1 Replace `_write-session` with `_capture-session` that reads captured output from stdin
- [x] 1.2 Remove the `--output-file` contract and any arbitrary file-read behavior from the CLI
- [x] 1.3 Update generated Bash and Zsh snippets to redirect private temporary capture data to stdin
- [x] 1.4 Ensure shell snippets create and clean up capture files with private permissions and safe failure handling
- [x] 1.5 Add best-effort cleanup for abnormal shell termination and stale temp artifact removal on subsequent shell startup
- [x] 1.6 Implement a narrow default sensitive-command denylist, including `sudo`, other privilege-boundary entrypoints, secret-retrieval tools, and environment-dump commands, while keeping general-purpose commands such as `cat` capturable by default

## 2. Sanitize before persistence
- [x] 2.1 Introduce a capture sanitization pipeline that enforces byte limits, strips control sequences, and normalizes text
- [x] 2.2 Implement deterministic secret redaction for command, output, and optional cwd fields
- [x] 2.3 Persist only sanitized analysis bundles and include truncation/redaction metadata
- [x] 2.4 Enforce maximum field lengths and oversized-file rejection when reading session state
- [x] 2.5 Document the supported secret-detection strategy and its best-effort limitations in developer and user-facing docs

## 3. Secure local storage
- [x] 3.1 Add shared helpers for creating private XDG directories and files with explicit `0700`/`0600` permissions
- [x] 3.2 Migrate session writes to atomic temp-file-plus-rename behavior
- [x] 3.3 Apply the same private and atomic file handling to cache and config writes
- [x] 3.4 Reject symlinked or non-regular files for sensitive reads and writes where practical

## 4. Safe display and request construction
- [x] 4.1 Sanitize confirmation prompts, verbose logs, and formatted model output for terminal safety
- [x] 4.2 Exclude `cwd` from outbound requests by default and add config validation for opt-in inclusion
- [x] 4.3 Apply output truncation before provider invocation and cache lookup
- [x] 4.4 Ensure cache keys and cached payloads are derived only from sanitized analysis bundles

## 5. Provider transport hardening
- [x] 5.1 Remove any provider authentication flow that places credentials in URLs
- [x] 5.2 Require HTTPS for remote providers while preserving explicit local HTTP support
- [x] 5.3 Review provider error handling to avoid echoing sensitive request material in diagnostics

## 6. Validation and documentation
- [x] 6.1 Add unit tests for redaction determinism, control-sequence stripping, byte limiting, and bundle validation
- [x] 6.2 Add integration tests for secure shell capture, temp-file cleanup, and sanitized end-to-end analysis
- [x] 6.3 Add permission-focused tests for state, config, and cache paths
- [x] 6.4 Update README, quick start, and troubleshooting docs to describe the new security model and safer defaults
- [x] 6.5 Add a published threat-model section that states supported normal-development use, residual risks, and unsupported high-secrecy or regulated environments
- [x] 6.6 Add a pre-release checklist that verifies no raw persistence, private file modes, terminal-safe rendering, and documented consent boundaries before public launch
- [x] 6.7 Add tests and docs for the default sensitive-command denylist, including `sudo` as an explicit example, confirmation that skipped commands do not overwrite an existing non-privileged failure bundle, and an explicit example that `cat` is not skipped solely because it reads file contents

## 7. Limit persistence to failed commands
- [x] 7.1 Update shell-hook success paths so exit code `0` does not persist output and clears any previously stored failed session
- [x] 7.2 Update CLI messaging so running `repair` after a successful command explains that no failed command is currently available for analysis
- [x] 7.3 Add tests covering failure capture, success-path cleanup, and `repair` invocation after a successful command
