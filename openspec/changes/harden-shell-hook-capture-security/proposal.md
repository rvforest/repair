# Change: Harden Shell Hook Capture Security

## Why
The current shell-hook design captures full command output, persists it in plaintext, and exposes an internal CLI subcommand that can read arbitrary files from disk. That design is convenient, but it creates avoidable security risks: secrets can be written to the XDG state directory before redaction, permissive filesystem defaults can expose sensitive data to other local users, control sequences can be replayed into the terminal, and unbounded capture can amplify both leakage and denial-of-service risks.

The tool needs a security-first capture pipeline that minimizes data before persistence, avoids arbitrary file reads, and treats both terminal output and LLM responses as untrusted input.

## What Changes
- Replace raw session persistence with a sanitize-before-persist capture pipeline
- Persist only failed command sessions so successful command output is not retained on disk
- Change shell hook ingestion so the internal CLI subcommand reads captured output from stdin instead of accepting `--output-file`
- Persist only a bounded, sanitized analysis bundle under the XDG state directory with explicit private permissions
- Skip privileged entrypoint commands such as `sudo` by default so elevated command output is not persisted or forwarded unintentionally
- Add terminal output sanitization that strips ANSI/OSC control sequences before confirmation prompts, logs, or formatted display
- Add secure file handling requirements for state, config, and cache files, including explicit permissions and atomic writes
- Update remote-provider request handling to avoid putting API credentials in URLs
- Tighten caching requirements so only sanitized analysis inputs and outputs may be cached
- Define a public release posture suitable for open source use as a normal development tool with clearly documented residual risks and unsupported high-secrecy use cases

## Impact
- Affected specs:
  - `shell-hook-integration` (modified) - capture, ingestion, and state persistence become security-hardened
  - `cli-utility` (modified) - internal session ingestion contract changes from file-path input to stdin-based input and safer diagnostics
  - `llm-analysis` (modified) - request construction must use sanitized, bounded session data and safe display rules
- Affected code:
  - `src/shell-hooks/` will need new secure capture and ingestion behavior
  - `src/session/` will change from raw session storage to sanitized analysis bundle storage with atomic writes and private permissions
  - `src/security/` will need stronger redaction, control-sequence stripping, and size-limiting logic
  - `src/cli.ts` will replace `--output-file` ingestion with stdin ingestion
  - `src/cache/`, `src/config/`, and provider modules will need secure file handling and request transport updates

## Release Position
After this change, the project should be suitable to share as an open source tool for normal software development workflows, provided the documentation clearly states that:

- secret detection and redaction are best-effort rather than perfect
- local persistence is limited to a sanitized, bounded bundle rather than a raw transcript
- abrupt shell termination may leave behind short-lived private temp artifacts until cleanup runs
- the tool is not positioned for highly regulated, high-secrecy, or adversarial multi-user environments without additional controls
