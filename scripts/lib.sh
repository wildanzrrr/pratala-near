#!/usr/bin/env bash
# Shared helpers for scripts/0*.sh. Source it, do not run it:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$SCRIPT_DIR/lib.sh"
#
# Provides: logging, confirm, .env loading, deploy/testnet.json read/write (jq),
# near_view / near_call wrappers around near-cli-rs 0.31.x, RPC helpers, explorer links.
# shellcheck shell=bash

if [[ -n "${PRATALA_LIB_LOADED:-}" ]]; then return 0; fi
PRATALA_LIB_LOADED=1

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ROOT_DIR

# ---------------------------------------------------------------- logging ---
if [[ -t 2 && -z "${NO_COLOR:-}" ]]; then
  C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_RED=$'\033[31m'; C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'; C_BOLD=$'\033[1m'
else
  C_RESET=''; C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_BOLD=''
fi

log()  { printf '%s\n' "$*" >&2; }
info() { printf '%s•%s %s\n' "$C_BLUE" "$C_RESET" "$*" >&2; }
ok()   { printf '%s✓%s %s\n' "$C_GREEN" "$C_RESET" "$*" >&2; }
warn() { printf '%s!%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
err()  { printf '%s✗%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; }
die()  { err "$*"; exit 1; }
step() { printf '\n%s== %s%s\n' "$C_BOLD" "$*" "$C_RESET" >&2; }
dim()  { printf '%s%s%s\n' "$C_DIM" "$*" "$C_RESET" >&2; }

# "do X → see Y" banner printed at the start of every script.
expect() { printf '%s→ expect:%s %s\n' "$C_DIM" "$C_RESET" "$*" >&2; }

# confirm "<what will happen>" — returns 0 on y/Y, exits 1 otherwise. YES=1 skips the prompt.
confirm() {
  local what="$1" answer=""
  log ""
  log "${C_BOLD}${what}${C_RESET}"
  if [[ "${YES:-0}" == "1" ]]; then
    info "YES=1 set — proceeding without prompt"
    return 0
  fi
  if [[ ! -t 0 ]]; then
    die "stdin is not a terminal; re-run with YES=1 to confirm non-interactively"
  fi
  read -r -p "Proceed? [y/N] " answer
  case "$answer" in
    y|Y|yes|YES) return 0 ;;
    *) log "Aborted — nothing changed."; exit 1 ;;
  esac
}

require_cmd() {
  local c
  for c in "$@"; do
    command -v "$c" >/dev/null 2>&1 || die "'$c' not found — run scripts/00-install-toolchain.sh (CHECK_ONLY=1 to just list what is missing)"
  done
}

require_near_cli_rs() {
  require_cmd near
  if ! near --version 2>/dev/null | grep -q 'near-cli-rs'; then
    die "'near' on PATH is not near-cli-rs (got: $(near --version 2>&1 | head -1)). Install with: cargo binstall -y near-cli-rs"
  fi
}

# ------------------------------------------------------------------- env ---
# .env at the repo root is optional. It only supplies defaults: values already
# exported in the shell win, and deploy/testnet.json wins for contract ids.
load_env() {
  local f="${ENV_FILE:-$ROOT_DIR/.env}" line key val
  [[ -f "$f" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# || -z "${line// /}" ]] && continue
    [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[2]}"; val="${BASH_REMATCH[3]}"
    val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
    if [[ -z "${!key:-}" ]]; then export "$key=$val"; fi
  done < "$f"
}
load_env

NEAR_NETWORK="${NEAR_NETWORK:-testnet}"
NEAR_RPC_URL="${NEAR_RPC_URL:-https://test.rpc.fastnear.com}"
NEAR_ARCHIVAL_RPC_URL="${NEAR_ARCHIVAL_RPC_URL:-https://archival-rpc.testnet.fastnear.com}"
EXPLORER_BASE="${EXPLORER_BASE:-https://testnet.nearblocks.io}"
DEPLOY_FILE="${DEPLOY_FILE:-$ROOT_DIR/deploy/testnet.json}"
LOG_DIR="${LOG_DIR:-$ROOT_DIR/deploy/logs}"
# keychain = OS keychain (macOS Keychain / libsecret); legacy-keychain = ~/.near-credentials
NEAR_KEYCHAIN="${NEAR_KEYCHAIN:-keychain}"
export NEAR_NETWORK NEAR_RPC_URL NEAR_ARCHIVAL_RPC_URL EXPLORER_BASE DEPLOY_FILE LOG_DIR NEAR_KEYCHAIN

case "$NEAR_KEYCHAIN" in
  keychain|legacy-keychain) ;;
  *) die "NEAR_KEYCHAIN must be 'keychain' or 'legacy-keychain' (got '$NEAR_KEYCHAIN')" ;;
esac

require_testnet() {
  [[ "$NEAR_NETWORK" == "testnet" ]] || die "these scripts only target testnet (NEAR_NETWORK=$NEAR_NETWORK)"
}

# ------------------------------------------------- deploy/testnet.json (jq) ---
state_init() {
  require_cmd jq
  mkdir -p "$(dirname "$DEPLOY_FILE")"
  if [[ ! -s "$DEPLOY_FILE" ]]; then
    jq -n --arg net "$NEAR_NETWORK" --arg rpc "$NEAR_RPC_URL" --arg exp "$EXPLORER_BASE" \
      '{network:$net, rpc:$rpc, explorer:$exp, accounts:{}, contracts:{}, lots:{}, txs:{}}' > "$DEPLOY_FILE"
    info "created $DEPLOY_FILE"
  fi
  jq -e . "$DEPLOY_FILE" >/dev/null || die "$DEPLOY_FILE is not valid JSON"
}

# state_get '.accounts.root' → value as raw string, empty if null/missing.
state_get() {
  [[ -f "$DEPLOY_FILE" ]] || { printf ''; return 0; }
  jq -r "($1) // empty" "$DEPLOY_FILE"
}

# state_set '.accounts.root' '"pratala.testnet"'   (value is JSON)
state_set() {
  local path="$1" json="$2" tmp
  state_init
  tmp="$(mktemp "${DEPLOY_FILE}.XXXXXX")"
  jq --argjson v "$json" --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$path = \$v | .updated_at = \$now" "$DEPLOY_FILE" > "$tmp" && mv "$tmp" "$DEPLOY_FILE"
}

# state_set_str '.accounts.root' 'pratala.testnet'
state_set_str() { state_set "$1" "$(jq -n --arg s "$2" '$s')"; }

# Account ids: deploy/testnet.json first, then env var, then the documented default.
acct() {
  local name="$1" v
  v="$(state_get ".accounts.\"$name\"")"
  if [[ -n "$v" ]]; then printf '%s' "$v"; return 0; fi
  case "$name" in
    root)  v="${ROOT_ID:-}" ;;
    lots)  v="${LOTS_CONTRACT_ID:-}" ;;
    pusdc) v="${PUSDC_CONTRACT_ID:-}" ;;
    *)     v="" ;;
  esac
  printf '%s' "$v"
}

require_acct() {
  local v
  v="$(acct "$1")"
  [[ -n "$v" ]] || die "no '$1' account in $DEPLOY_FILE — run scripts/02-create-accounts.sh first"
  printf '%s' "$v"
}

# ------------------------------------------------------------ near-cli-rs ---
# near_view <contract> <method> [json-args] → raw JSON on stdout.
near_view() {
  local contract="$1" method="$2" args="${3:-}"
  [[ -n "$args" ]] || args='{}'
  near --quiet contract call-function as-read-only "$contract" "$method" \
    json-args "$args" network-config "$NEAR_NETWORK" now 2>"$LOG_DIR/last-view.err"
}

# near_view_json: like near_view but prints nothing and returns 1 if the call fails
# or returns null (e.g. get_lot for an unknown id).
near_view_json() {
  local out
  out="$(near_view "$@")" || return 1
  [[ -n "$out" && "$out" != "null" ]] || return 1
  printf '%s' "$out"
}

# near_call <signer> <contract> <method> <json-args> <gas> <deposit> [tx-key]
#   gas e.g. '30 Tgas'; deposit e.g. '0 NEAR', '1 yoctoNEAR', '0.1 NEAR'.
#   Sets LAST_TX_HASH and LAST_CALL_OUT (file with the CLI stdout = return value).
#   With tx-key, records the hash at .txs."<tx-key>" in deploy/testnet.json.
LAST_TX_HASH=""
LAST_CALL_OUT=""
near_call() {
  local signer="$1" contract="$2" method="$3" args="$4" gas="$5" deposit="$6" key="${7:-}"
  local base rc=0
  mkdir -p "$LOG_DIR"
  base="$LOG_DIR/$(date -u +%Y%m%dT%H%M%S)-${method}-$$-${RANDOM}"
  dim "  near: $signer → $contract.$method $args  [$gas, $deposit]"
  near contract call-function as-transaction "$contract" "$method" json-args "$args" \
    prepaid-gas "$gas" attached-deposit "$deposit" \
    sign-as "$signer" network-config "$NEAR_NETWORK" "sign-with-$NEAR_KEYCHAIN" send \
    >"$base.out" 2>"$base.err" || rc=$?
  LAST_CALL_OUT="$base.out"
  LAST_TX_HASH="$(extract_tx_hash "$base.out" "$base.err")"
  if [[ $rc -ne 0 ]]; then
    err "$method failed (exit $rc). Last lines of $base.err:"
    tail -n 15 "$base.err" >&2 || true
    [[ -n "$LAST_TX_HASH" ]] && err "tx: $(explorer_tx "$LAST_TX_HASH")"
    return "$rc"
  fi
  if [[ -n "$LAST_TX_HASH" ]]; then
    ok "$method  tx $(explorer_tx "$LAST_TX_HASH")"
    [[ -n "$key" ]] && state_set_str ".txs.\"$key\"" "$LAST_TX_HASH"
  else
    warn "$method sent but no 'Transaction ID' found in CLI output (see $base.err)"
  fi
  return 0
}

# near_run <tx-key|-> <near-cli args...> — any other signed near-cli command
# (create-account, deploy, send-near). Records the tx hash like near_call.
near_run() {
  local key="$1" base rc=0
  shift
  mkdir -p "$LOG_DIR"
  base="$LOG_DIR/$(date -u +%Y%m%dT%H%M%S)-${1:-near}-$$-${RANDOM}"
  dim "  near $*"
  near "$@" >"$base.out" 2>"$base.err" || rc=$?
  LAST_CALL_OUT="$base.out"
  LAST_TX_HASH="$(extract_tx_hash "$base.out" "$base.err")"
  if [[ $rc -ne 0 ]]; then
    err "near $1 $2 failed (exit $rc). Last lines of $base.err:"
    tail -n 15 "$base.err" >&2 || true
    return "$rc"
  fi
  if [[ -n "$LAST_TX_HASH" ]]; then
    ok "tx $(explorer_tx "$LAST_TX_HASH")"
    [[ "$key" != "-" ]] && state_set_str ".txs.\"$key\"" "$LAST_TX_HASH"
  fi
  return 0
}

extract_tx_hash() {
  # near-cli-rs prints "Transaction ID: <base58>" after a successful send.
  cat "$@" 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' \
    | grep -Eo 'Transaction ID: [1-9A-HJ-NP-Za-km-z]{43,44}' | tail -n 1 | awk '{print $3}' || true
}

# --------------------------------------------------------------- RPC (curl) ---
# rpc <method> <params-json> [url] → full JSON-RPC response on stdout.
rpc() {
  local method="$1" params="$2" url="${3:-$NEAR_RPC_URL}"
  require_cmd curl jq
  curl -sS --fail --max-time 30 -H 'Content-Type: application/json' \
    -d "$(jq -cn --arg m "$method" --argjson p "$params" '{jsonrpc:"2.0",id:"pratala",method:$m,params:$p}')" \
    "$url"
}

# view_account <id> → {"amount": "...", "locked": "...", "code_hash": "...", "storage_usage": N} or empty.
view_account() {
  rpc query "$(jq -cn --arg a "$1" '{request_type:"view_account",finality:"final",account_id:$a}')" \
    | jq -c '.result // empty'
}

# account_state <id> → prints "exists" | "missing" | "error" (via near-cli-rs view-account-summary).
account_state() {
  local id="$1" out rc=0
  out="$(near account view-account-summary "$id" network-config "$NEAR_NETWORK" now 2>&1)" || rc=$?
  if [[ $rc -eq 0 ]]; then echo exists
  elif grep -q 'does not exist' <<<"$out"; then echo missing
  else echo error
  fi
}

# NEAR balance as a decimal NEAR string (float precision; display/thresholds only).
near_balance() {
  local a
  a="$(view_account "$1")"
  [[ -n "$a" ]] || { echo 0; return 0; }
  jq -r '(.amount | tonumber) / 1e24' <<<"$a"
}

# Free NEAR above storage staking (1 byte = 1e19 yocto), as decimal NEAR.
near_free_balance() {
  local a
  a="$(view_account "$1")"
  [[ -n "$a" ]] || { echo 0; return 0; }
  jq -r '((.amount | tonumber) - (.storage_usage * 1e19)) / 1e24' <<<"$a"
}

has_code() {
  local a
  a="$(view_account "$1")"
  [[ -n "$a" ]] && [[ "$(jq -r .code_hash <<<"$a")" != "11111111111111111111111111111111" ]]
}

# float_lt a b → true if a < b
float_lt() { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a<b)}'; }

# ------------------------------------------------------------------ misc ---
explorer_tx()      { printf '%s/txns/%s' "$EXPLORER_BASE" "$1"; }
explorer_account() { printf '%s/address/%s' "$EXPLORER_BASE" "$1"; }

sha256_hex() {
  if command -v sha256sum >/dev/null 2>&1; then printf '%s' "$1" | sha256sum | awk '{print $1}'
  else printf '%s' "$1" | shasum -a 256 | awk '{print $1}'
  fi
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'
  fi
}

file_size() { wc -c <"$1" | tr -d ' '; }

rand_hex4() { od -An -N2 -tx1 /dev/urandom | tr -d ' \n'; }

# pUSDC base units (6 dp) → "396.90" (two decimals, truncated)
fmt_pusdc() {
  local v="${1:-0}"
  [[ "$v" =~ ^[0-9]+$ ]] || { printf '%s' "$v"; return 0; }
  printf '%d.%02d' "$((v / 1000000))" "$(((v % 1000000) / 10000))"
}

# "YYYY-MM" n months after the current UTC month
month_plus() {
  local n="$1" y m
  y="$(date -u +%Y)"; m="$(date -u +%m)"; m=$((10#$m - 1 + n))
  printf '%04d-%02d' "$((y + m / 12))" "$((m % 12 + 1))"
}

mkdir -p "$LOG_DIR" 2>/dev/null || true
