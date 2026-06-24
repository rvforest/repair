# Spike: `pass` Credential Backend

## Purpose

Validate whether `pass` can provide a small, dependable credential backend for repAIr on Linux and WSL without adding an npm authentication dependency or writing secrets to plaintext configuration.

## Environment

- Linux aarch64
- `pass` 1.7.4
- GnuPG 2.4.7
- Disposable `GNUPGHOME` and `PASSWORD_STORE_DIR` under `/tmp`
- Disposable, unprotected GPG identity created solely for this spike
- No access to the user's normal password store

## Commands Exercised

```text
pass init <gpg-id>
pass insert --multiline --force repair/openai
pass show repair/openai
pass rm --force repair/openai
```

The secret was supplied to `pass insert` through standard input. No shell was required to interpret the operation, and the secret was not included in command arguments.

## Findings

### Storage and lifecycle

- Initialization, insertion, replacement, retrieval, and removal work with a dedicated `PASSWORD_STORE_DIR`.
- Entries map cleanly to `repair/<provider>`, for example `repair/openai`.
- The generated `.gpg-id`, entry directory, and encrypted entry used owner-only permissions in the tested environment.
- Forced replacement and forced removal are deterministic and avoid subprocess prompts after repAIr performs its own overwrite confirmation.

### Error behavior

- A missing or uninitialized store and a missing entry both return a nonzero status with text equivalent to “not in the password store.”
- These cases need preflight checks to distinguish:
  - `pass` executable unavailable
  - store uninitialized or invalid
  - credential absent
- GPG-agent startup or decryption failures are distinct from missing credentials and must not be collapsed into the same error.
- GPG access can block on pinentry or agent interaction. Every invocation therefore needs a timeout and process-tree termination.
- The observed missing-entry and GPG failure output did not contain the supplied test secret.

### Integration constraints

- Invoke an absolute, discovered `pass` executable with argument arrays and `shell: false`.
- Send credential values only through stdin.
- Capture stdout and stderr in bounded buffers.
- Never include captured subprocess output in normal user-facing errors without sanitization.
- Treat stdout from successful `pass show` as secret material and trim only the final line ending; do not log it.
- Validate provider names before constructing `repair/<provider>` paths.
- Require an existing, initialized password store. repAIr must not initialize GPG or `pass` for the user.
- Environment variables remain the non-interactive and CI path and take precedence over `pass`.

## Error Classification

The adapter should expose stable application errors instead of leaking subprocess details:

| Condition | Application result |
|---|---|
| `pass` executable missing | backend unavailable |
| password store lacks `.gpg-id` | backend uninitialized |
| entry does not exist | credential missing |
| timeout or pinentry blockage | backend timed out |
| GPG/pinentry cancellation | credential access cancelled |
| other nonzero exit | backend failure |

## Conclusion

`pass` is viable as the initial secure storage backend for Linux and WSL. It uses established external tools already controlled by the user and requires no npm credential-storage dependency. Production work must include strict subprocess boundaries, preflight checks, timeouts, secret-safe errors, and tests using a fake executable rather than a developer's real password store.
