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

function generateStartRedirectFn(): string {
  return `  repair_start_redirect() {
    exec {REPAIR_SAVED_STDOUT}>&1 {REPAIR_SAVED_STDERR}>&2
    exec > >(tee -a "$REPAIR_LAST_OUTPUT_FILE" >&$REPAIR_SAVED_STDOUT) \\
         2> >(tee -a "$REPAIR_LAST_OUTPUT_FILE" >&$REPAIR_SAVED_STDERR)
    REPAIR_CAPTURE_ACTIVE=1
  }`;
}

function generateRestoreRedirectFn(): string {
  return `  repair_restore_redirect() {
    exec 1>&$REPAIR_SAVED_STDOUT 2>&$REPAIR_SAVED_STDERR
    exec {REPAIR_SAVED_STDOUT}>&- {REPAIR_SAVED_STDERR}>&-
    REPAIR_CAPTURE_ACTIVE=0
  }`;
}

function generateZshInit(): string {
  return `export REPAIR_SHELL_INTEGRATION=1
if [[ -z "\${REPAIR_SHELL_HOOKS_LOADED:-}" ]]; then
  export REPAIR_SHELL_HOOKS_LOADED=1
  typeset -g REPAIR_CAPTURE_ACTIVE=0
  typeset -g REPAIR_LAST_COMMAND=""
  typeset -g REPAIR_LAST_TIMESTAMP=""
  typeset -g REPAIR_LAST_OUTPUT_FILE=""

  repair_should_skip() {
    case "$1" in
      repair|repair\ *|command\ repair|command\ repair\ *) return 0 ;;
    esac
    return 1
  }

${generateStartRedirectFn()}

${generateRestoreRedirectFn()}

  repair_preexec() {
    local cmd="$1"
    repair_should_skip "$cmd" && { REPAIR_CAPTURE_ACTIVE=0; return; }

    REPAIR_LAST_COMMAND="$cmd"
    printf -v REPAIR_LAST_TIMESTAMP '%(%s)T' -1
    REPAIR_LAST_OUTPUT_FILE="$(mktemp "\${TMPDIR:-/tmp}/repair-session.XXXXXX")"

    repair_start_redirect
  }

  repair_precmd() {
    local exit_code=$?

    if [[ "\${REPAIR_CAPTURE_ACTIVE:-0}" -ne 1 ]]; then
      return $exit_code
    fi

    {
      repair_restore_redirect

      command repair _write-session \
        --cmd "$REPAIR_LAST_COMMAND" \
        --output-file "$REPAIR_LAST_OUTPUT_FILE" \
        --code "$exit_code" \
        --ts "$REPAIR_LAST_TIMESTAMP" \
        --cwd "$PWD" \
        --shell "zsh" >/dev/null 2>&1 || true
    } always {
      rm -f "$REPAIR_LAST_OUTPUT_FILE"
      unset REPAIR_LAST_OUTPUT_FILE
    }

    return $exit_code
  }

  autoload -Uz add-zsh-hook
  add-zsh-hook preexec repair_preexec
  add-zsh-hook precmd repair_precmd
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

  repair_should_skip() {
    case "$1" in
      repair|repair\ *|command\ repair|command\ repair\ *|repair_prompt_command|repair_debug_trap) return 0 ;;
    esac
    return 1
  }

${generateStartRedirectFn()}

${generateRestoreRedirectFn()}

  repair_debug_trap() {
    [[ "\${REPAIR_CAPTURE_ACTIVE:-0}" -eq 1 ]] && return
    [[ -n "\${COMP_LINE-}" ]] && return
    repair_should_skip "$BASH_COMMAND" && return

    local cmd
    cmd="$(HISTTIMEFORMAT= history 1 2>/dev/null | sed 's/^ *[0-9]\+ *//')"
    if [[ -z "$cmd" ]]; then
      cmd="$BASH_COMMAND"
    fi

    REPAIR_LAST_COMMAND="$cmd"
    printf -v REPAIR_LAST_TIMESTAMP '%(%s)T' -1
    REPAIR_LAST_OUTPUT_FILE="$(mktemp "\${TMPDIR:-/tmp}/repair-session.XXXXXX")"

    repair_start_redirect
  }

  repair_prompt_command() {
    local exit_code=$?

    if [[ "\${REPAIR_CAPTURE_ACTIVE:-0}" -eq 1 ]]; then
      local _output_file="$REPAIR_LAST_OUTPUT_FILE"
      REPAIR_LAST_OUTPUT_FILE=""

      repair_restore_redirect

      command repair _write-session \
        --cmd "$REPAIR_LAST_COMMAND" \
        --output-file "$_output_file" \
        --code "$exit_code" \
        --ts "$REPAIR_LAST_TIMESTAMP" \
        --cwd "$PWD" \
        --shell "bash" >/dev/null 2>&1 || true

      rm -f "$_output_file"
    fi

    if [[ -n "\${REPAIR_PREVIOUS_PROMPT_COMMAND:-}" ]]; then
      eval "$REPAIR_PREVIOUS_PROMPT_COMMAND"
    fi

    return $exit_code
  }

  trap 'repair_debug_trap' DEBUG
  PROMPT_COMMAND='repair_prompt_command'
fi`;
}