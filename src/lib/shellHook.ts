// Hook digitado no shell remoto quando o terminal abre (ver TerminalView). Uma linha só,
// sem "!" (history expansion) e com espaço na frente (fora do histórico).
// - OSC 7 com o cwd a cada prompt, pro modo Arquivos abrir na pasta do terminal
// - nano/vim/vi <arquivo que existe> viram OSC 1337 pro editor do app; qualquer outra forma
//   (flags, vários arquivos, arquivo novo, dentro de tmux/screen) chama o editor de verdade
// - bash sem ignorespace: apaga a própria linha do histórico
export const HOOK_READY = "\x1b]1337;SSHDeckReady\x07";
export const EDIT_PREFIX = "SSHDeckEdit=";

export const SHELL_HOOK =
  " " +
  [
    `__sd_edit() { if [ $# -eq 2 ] && [ -f "$2" ] && [ -z "$TMUX$STY" ]; then case $2 in /*) ;; *) set -- "$1" "$PWD/$2";; esac; printf '\\033]1337;${EDIT_PREFIX}%s\\007' "$2"; else command "$@"; fi; }`,
    // vi antes de vim: com alias vi=vim (RHEL), a definição de vi vira a de vim e é sobrescrita
    `vi() { __sd_edit vi "$@"; }`,
    `vim() { __sd_edit vim "$@"; }`,
    `nano() { __sd_edit nano "$@"; }`,
    `__sd_cwd() { local s=$?; printf '\\033]7;%s\\007' "$PWD"; return $s; }`,
    `if [ -n "$ZSH_VERSION" ]; then eval 'precmd_functions+=(__sd_cwd)'; else PROMPT_COMMAND="__sd_cwd\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"; case $HISTCONTROL in *ignorespace*|*ignoreboth*) ;; *) history -d $((HISTCMD-1)) 2>/dev/null;; esac; fi`,
    `printf '\\033]1337;SSHDeckReady\\007'`,
  ].join("; ");
