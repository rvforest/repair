export type SupportedShell = 'bash' | 'zsh';

const SUPPORTED_SHELLS: SupportedShell[] = ['bash', 'zsh'];

export function getSupportedShells(): SupportedShell[] {
  return [...SUPPORTED_SHELLS];
}

export function isSupportedShell(shell: string): shell is SupportedShell {
  return SUPPORTED_SHELLS.includes(shell as SupportedShell);
}

export function generateShellInit(shell: string): string {
  if (!isSupportedShell(shell)) {
    throw new Error(
      `Unsupported shell: ${shell}. Supported shells: ${SUPPORTED_SHELLS.join(', ')}`,
    );
  }

  return shell === 'zsh' ? generateZshInit() : generateBashInit();
}

function generateStartRedirectFn(shell: SupportedShell): string {
  const startTees =
    shell === 'zsh'
      ? `    setopt localoptions nomonitor
    tee -a "$REPAIR_LAST_OUTPUT_FILE" <"$REPAIR_STDOUT_FIFO" >&$REPAIR_SAVED_STDOUT &
    REPAIR_STDOUT_TEE_PID=$!
    tee -a "$REPAIR_LAST_OUTPUT_FILE" <"$REPAIR_STDERR_FIFO" >&$REPAIR_SAVED_STDERR &
    REPAIR_STDERR_TEE_PID=$!`
      : `    tee -a "$REPAIR_LAST_OUTPUT_FILE" <"$REPAIR_STDOUT_FIFO" >&$REPAIR_SAVED_STDOUT &
    REPAIR_STDOUT_TEE_PID=$!
    tee -a "$REPAIR_LAST_OUTPUT_FILE" <"$REPAIR_STDERR_FIFO" >&$REPAIR_SAVED_STDERR &
    REPAIR_STDERR_TEE_PID=$!`;

  return `  repair_start_redirect() {
    exec {REPAIR_SAVED_STDOUT}>&1 {REPAIR_SAVED_STDERR}>&2
    REPAIR_REDIRECT_DIR="$(mktemp -d "\${TMPDIR:-/tmp}/repair-redirect.XXXXXX")"
    REPAIR_STDOUT_FIFO="$REPAIR_REDIRECT_DIR/stdout"
    REPAIR_STDERR_FIFO="$REPAIR_REDIRECT_DIR/stderr"
    mkfifo "$REPAIR_STDOUT_FIFO" "$REPAIR_STDERR_FIFO"
${startTees}
    exec {REPAIR_STDOUT_FD}>"$REPAIR_STDOUT_FIFO" {REPAIR_STDERR_FD}>"$REPAIR_STDERR_FIFO"
    exec >&$REPAIR_STDOUT_FD 2>&$REPAIR_STDERR_FD
    REPAIR_CAPTURE_ACTIVE=1
  }`;
}

function generateRestoreRedirectFn(shell: SupportedShell): string {
  const waitForTees =
    shell === 'zsh'
      ? '    setopt localoptions nomonitor\n    wait "$REPAIR_STDOUT_TEE_PID" "$REPAIR_STDERR_TEE_PID" 2>/dev/null || true'
      : '    wait "$REPAIR_STDOUT_TEE_PID" "$REPAIR_STDERR_TEE_PID" 2>/dev/null || true';

  return `  repair_restore_redirect() {
    exec 1>&$REPAIR_SAVED_STDOUT 2>&$REPAIR_SAVED_STDERR
    exec {REPAIR_STDOUT_FD}>&- {REPAIR_STDERR_FD}>&-
${waitForTees}
    rm -f "$REPAIR_STDOUT_FIFO" "$REPAIR_STDERR_FIFO"
    rmdir "$REPAIR_REDIRECT_DIR" 2>/dev/null || true
    exec {REPAIR_SAVED_STDOUT}>&- {REPAIR_SAVED_STDERR}>&-
    unset REPAIR_REDIRECT_DIR REPAIR_STDOUT_FIFO REPAIR_STDERR_FIFO
    unset REPAIR_STDOUT_TEE_PID REPAIR_STDERR_TEE_PID
    unset REPAIR_STDOUT_FD REPAIR_STDERR_FD
    REPAIR_CAPTURE_ACTIVE=0
  }`;
}

function generateZshInit(): string {
  return `export REPAIR_SHELL_INTEGRATION=1
if [[ -z "\${REPAIR_SHELL_HOOKS_LOADED:-}" ]]; then
  export REPAIR_SHELL_HOOKS_LOADED=1
  typeset -g REPAIR_CAPTURE_ACTIVE=0
  typeset -g REPAIR_CAPTURE_STALE_MINUTES=60
  typeset -g REPAIR_LAST_COMMAND=""
  typeset -g REPAIR_LAST_TIMESTAMP=""
  typeset -g REPAIR_LAST_OUTPUT_FILE=""
  typeset -g REPAIR_CAPTURE_DIR="\${XDG_STATE_HOME:-$HOME/.local/state}/repair/captures"
  export REPAIR_LAST_CAPTURE_STATUS="\${REPAIR_LAST_CAPTURE_STATUS:-none}"

  repair_prepare_capture_dir() {
    install -d -m 700 "$REPAIR_CAPTURE_DIR" >/dev/null 2>&1 || return 1
    return 0
  }

  repair_cleanup_stale_captures() {
    repair_prepare_capture_dir || return 0
    command find "$REPAIR_CAPTURE_DIR" -type f -name 'capture.*' -mmin +$REPAIR_CAPTURE_STALE_MINUTES -delete >/dev/null 2>&1 || true
  }

  repair_cleanup_capture_file() {
    if [[ -n "\${REPAIR_LAST_OUTPUT_FILE:-}" ]]; then
      rm -f "$REPAIR_LAST_OUTPUT_FILE"
      unset REPAIR_LAST_OUTPUT_FILE
    fi
  }

  repair_command_entrypoint() {
    local cmd="$1"
    cmd="\${cmd##[[:space:]]}"
    cmd="\${cmd#command }"
    cmd="\${cmd#builtin }"
    cmd="\${cmd#exec }"
    printf '%s' "\${cmd%%[[:space:];|&()<>]*}"
  }

  repair_sensitive_command() {
    case "$1" in
      sudo|doas|su|pass|op|bw|vault|secret-tool|security|env|printenv) return 0 ;;
    esac
    return 1
  }

  repair_should_skip() {
    case "$1" in
      "repair" | "repair "* | "command repair" | "command repair *") return 0 ;;
    esac
    return 1
  }

${generateStartRedirectFn('zsh')}

${generateRestoreRedirectFn('zsh')}

  repair_preexec() {
    local cmd="$1"
    repair_should_skip "$cmd" && { REPAIR_CAPTURE_ACTIVE=0; return; }

    local entrypoint
    entrypoint="$(repair_command_entrypoint "$cmd")"
    if repair_sensitive_command "$entrypoint"; then
      export REPAIR_LAST_CAPTURE_STATUS="skipped:$entrypoint"
      REPAIR_CAPTURE_ACTIVE=0
      repair_cleanup_capture_file
      return
    fi

    REPAIR_LAST_COMMAND="$cmd"
    REPAIR_LAST_TIMESTAMP=$(print -P '%D{%s}')
    repair_prepare_capture_dir || { REPAIR_CAPTURE_ACTIVE=0; return; }
    REPAIR_LAST_OUTPUT_FILE="$(mktemp "$REPAIR_CAPTURE_DIR/capture.XXXXXX")" || { REPAIR_CAPTURE_ACTIVE=0; return; }

    repair_start_redirect
  }

  repair_precmd() {
    local exit_code=$?

    if [[ "\${REPAIR_CAPTURE_ACTIVE:-0}" -ne 1 ]]; then
      return $exit_code
    fi

    {
      repair_restore_redirect

      if [[ "$exit_code" -eq 0 ]]; then
        command repair _capture-session \
          --cmd "$REPAIR_LAST_COMMAND" \
          --code "$exit_code" \
          --ts "$REPAIR_LAST_TIMESTAMP" \
          --cwd "$PWD" \
          --shell "zsh" </dev/null >/dev/null 2>&1 && export REPAIR_LAST_CAPTURE_STATUS="success"
      else
        command repair _capture-session \
          --cmd "$REPAIR_LAST_COMMAND" \
          --code "$exit_code" \
          --ts "$REPAIR_LAST_TIMESTAMP" \
          --cwd "$PWD" \
          --shell "zsh" < "$REPAIR_LAST_OUTPUT_FILE" >/dev/null 2>&1 && export REPAIR_LAST_CAPTURE_STATUS="captured"
      fi
    } always {
      repair_cleanup_capture_file
    }
    return $exit_code
  }

  repair_zsh_cleanup() {
    repair_cleanup_capture_file
  }

  autoload -Uz add-zsh-hook
  repair_cleanup_stale_captures
  add-zsh-hook preexec repair_preexec
  add-zsh-hook precmd repair_precmd
  add-zsh-hook zshexit repair_zsh_cleanup
fi`;
}

function generateBashInit(): string {
  return `export REPAIR_SHELL_INTEGRATION=1
if [[ -z "\${REPAIR_SHELL_HOOKS_LOADED:-}" ]]; then
  export REPAIR_SHELL_HOOKS_LOADED=1
  REPAIR_CAPTURE_ACTIVE=0
  REPAIR_LAST_COMMAND=""
  REPAIR_LAST_TIMESTAMP=""
  REPAIR_LAST_OUTPUT_FILE=""
  REPAIR_PREVIOUS_PROMPT_COMMAND="\${PROMPT_COMMAND-}"
  REPAIR_CAPTURE_DIR="\${XDG_STATE_HOME:-$HOME/.local/state}/repair/captures"
  export REPAIR_LAST_CAPTURE_STATUS="\${REPAIR_LAST_CAPTURE_STATUS:-none}"
  REPAIR_CAPTURE_STALE_MINUTES=60

  repair_prepare_capture_dir() {
    install -d -m 700 "$REPAIR_CAPTURE_DIR" >/dev/null 2>&1 || return 1
    return 0
  }

  repair_cleanup_stale_captures() {
    repair_prepare_capture_dir || return 0
    command find "$REPAIR_CAPTURE_DIR" -type f -name 'capture.*' -mmin +$REPAIR_CAPTURE_STALE_MINUTES -delete >/dev/null 2>&1 || true
  }

  repair_cleanup_capture_file() {
    if [[ -n "\${REPAIR_LAST_OUTPUT_FILE:-}" ]]; then
      rm -f "$REPAIR_LAST_OUTPUT_FILE"
      REPAIR_LAST_OUTPUT_FILE=""
    fi
  }

  repair_command_entrypoint() {
    local cmd="$1"
    cmd="\${cmd#command }"
    cmd="\${cmd#builtin }"
    cmd="\${cmd#exec }"
    printf '%s' "\${cmd%%[[:space:];|&()<>]*}"
  }

  repair_sensitive_command() {
    case "$1" in
      sudo|doas|su|pass|op|bw|vault|secret-tool|security|env|printenv) return 0 ;;
    esac
    return 1
  }

  repair_should_skip() {
    case "$1" in
      "repair" | "repair "* | "command repair" | "command repair "* | "repair_prompt_command" | "repair_debug_trap") return 0 ;;
    esac
    return 1
  }

${generateStartRedirectFn('bash')}

${generateRestoreRedirectFn('bash')}

  repair_debug_trap() {
    [[ "\${REPAIR_CAPTURE_ACTIVE:-0}" -eq 1 ]] && return
    [[ -n "\${COMP_LINE-}" ]] && return
    repair_should_skip "$BASH_COMMAND" && return

    local entrypoint
    entrypoint="$(repair_command_entrypoint "$BASH_COMMAND")"
    if repair_sensitive_command "$entrypoint"; then
      export REPAIR_LAST_CAPTURE_STATUS="skipped:$entrypoint"
      REPAIR_CAPTURE_ACTIVE=0
      repair_cleanup_capture_file
      return
    fi

    local cmd
    cmd="$(HISTTIMEFORMAT= history 1 2>/dev/null | sed 's/^ *[0-9]${'\\+'} *//')"
    if [[ -z "$cmd" ]]; then
      cmd="$BASH_COMMAND"
    fi

    REPAIR_LAST_COMMAND="$cmd"
    printf -v REPAIR_LAST_TIMESTAMP '%(%s)T' -1
    repair_prepare_capture_dir || return
    REPAIR_LAST_OUTPUT_FILE="$(mktemp "$REPAIR_CAPTURE_DIR/capture.XXXXXX")" || return

    repair_start_redirect
  }

  repair_prompt_command() {
    local exit_code=$?

    if [[ "\${REPAIR_CAPTURE_ACTIVE:-0}" -eq 1 ]]; then
      local _output_file="$REPAIR_LAST_OUTPUT_FILE"
      REPAIR_LAST_OUTPUT_FILE=""

      repair_restore_redirect

      if [[ "$exit_code" -eq 0 ]]; then
        command repair _capture-session \
          --cmd "$REPAIR_LAST_COMMAND" \
          --code "$exit_code" \
          --ts "$REPAIR_LAST_TIMESTAMP" \
          --cwd "$PWD" \
          --shell "bash" </dev/null >/dev/null 2>&1 && export REPAIR_LAST_CAPTURE_STATUS="success"
      else
        command repair _capture-session \
          --cmd "$REPAIR_LAST_COMMAND" \
          --code "$exit_code" \
          --ts "$REPAIR_LAST_TIMESTAMP" \
          --cwd "$PWD" \
          --shell "bash" < "$_output_file" >/dev/null 2>&1 && export REPAIR_LAST_CAPTURE_STATUS="captured"
      fi

      rm -f "$_output_file"
    fi

    if [[ -n "\${REPAIR_PREVIOUS_PROMPT_COMMAND:-}" ]]; then
      eval "$REPAIR_PREVIOUS_PROMPT_COMMAND"
    fi

    return $exit_code
  }

  repair_shell_cleanup() {
    repair_cleanup_capture_file
  }

  repair_cleanup_stale_captures
  trap 'repair_debug_trap' DEBUG
  trap 'repair_shell_cleanup' EXIT
  PROMPT_COMMAND='repair_prompt_command'
fi`;
}
