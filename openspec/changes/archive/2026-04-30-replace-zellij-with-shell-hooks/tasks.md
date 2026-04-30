# Implementation Tasks

## 1. Replace the capture subsystem
- [x] 1.1 Add a session storage module that reads and writes the last captured session in the XDG state directory
- [x] 1.2 Add CLI internals for `repair init <shell>` and `repair _write-session`
- [x] 1.3 Implement generated shell snippets for Bash and Zsh that capture command text, output, exit code, and timestamp
- [x] 1.4 Decide how unsupported shells are handled and return explicit guidance from `repair init`
- [x] 1.5 Add unit tests for session serialization, invalid session payloads, and missing state file handling

## 2. Update the runtime analysis flow
- [x] 2.1 Replace `ZellijIntegration` usage in the main entrypoint with a session reader abstraction
- [x] 2.2 Update request construction to include exit metadata from captured shell sessions when available
- [x] 2.3 Replace Zellij-specific runtime errors with shell-integration setup guidance
- [x] 2.4 Remove Zellij version and installation checks
- [x] 2.5 Add tests for no integration configured, no captured command yet, and successful last-session analysis

## 3. Remove Zellij-specific product surface
- [x] 3.1 Remove or rename Zellij-specific modules, types, and package metadata
- [x] 3.2 Update help text, README, and quick start instructions to use `repair init <shell>`
- [x] 3.3 Remove Zellij troubleshooting guidance and replace it with shell hook troubleshooting
- [x] 3.4 Update any configuration descriptions that still refer to pane scrollback instead of captured session output

## 4. Validate the new shell-hook workflow
- [x] 4.1 Add end-to-end tests or fixture-driven tests for captured command plus output parsing
- [x] 4.2 Verify secret redaction and caching still behave correctly with shell-captured sessions
- [x] 4.3 Validate the documented setup flow on supported shells
- [x] 4.4 Reconcile all modified specs with implementation and archive the superseded Zellij behavior
