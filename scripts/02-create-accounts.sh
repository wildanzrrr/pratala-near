#!/usr/bin/env bash
# Create the Pratala testnet accounts and record them in deploy/testnet.json.
#
#   scripts/02-create-accounts.sh   (asks "Proceed? [y/N]"; YES=1 skips)
#
# Creates, in order:
#   1. ROOT_ID (default pratala.testnet; falls back to <base>-hack.testnet, then <base>-<4hex>.testnet
#      if taken) via the testnet faucet — root = contract owner + treasury
#   2. demo actors via the faucet: pratala-{farmer1,agent1,coop1,warehouse1,buyer1,investor2}-<suffix>.testnet
#   3. tops root up from the actors if it cannot fund the contract accounts
#   4. lots.<root> and pusdc.<root>, funded from root (sized from the wasm, 1 NEAR ≈ 100 KB)
#
# Keys are saved by near-cli-rs to the OS keychain (NEAR_KEYCHAIN=keychain, default) or to
# ~/.near-credentials (NEAR_KEYCHAIN=legacy-keychain). Nothing secret is written to the repo.
#
# Env overrides: ROOT_ID, ROOT_EXISTING=1 (adopt an existing root you hold the key for),
#   ACTOR_SUFFIX, LOTS_FUND_NEAR, PUSDC_FUND_NEAR, ROOT_RESERVE_NEAR, FAUCET_DELAY, NEAR_KEYCHAIN.
# Re-running is safe: accounts already recorded in deploy/testnet.json are skipped.
#
# Expect: "✓ accounts ready", a table of ids with explorer links, deploy/testnet.json .accounts filled.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

require_testnet
require_near_cli_rs
require_cmd jq curl awk
state_init

ACTORS=(farmer1 agent1 coop1 warehouse1 buyer1 investor2)
LOTS_MIN_NEAR="${LOTS_FUND_NEAR:-6}"
PUSDC_MIN_NEAR="${PUSDC_FUND_NEAR:-3}"
ROOT_RESERVE_NEAR="${ROOT_RESERVE_NEAR:-2}"   # kept on root for gas + storage_deposit calls
ACTOR_KEEP_NEAR="${ACTOR_KEEP_NEAR:-3}"       # an actor never drops below this when topping up root
FAUCET_DELAY="${FAUCET_DELAY:-3}"
LOTS_WASM="${LOTS_WASM:-$ROOT_DIR/smart-contract/target/near/harvest_lot/harvest_lot.wasm}"
PUSDC_WASM="${PUSDC_WASM:-$ROOT_DIR/smart-contract/target/near/pusdc/pusdc.wasm}"

step "Pratala testnet accounts"
expect "root + 2 contract sub-accounts + 6 demo actors exist on testnet and are listed in deploy/testnet.json"

# ---------------------------------------------------------------- pick root ---
pick_root() {
  local recorded base cand st
  recorded="$(state_get '.accounts.root')"
  if [[ -n "$recorded" ]]; then printf '%s' "$recorded"; return 0; fi
  cand="${ROOT_ID:-pratala.testnet}"
  base="${cand%.testnet}"
  for cand in "$cand" "${base}-hack.testnet" "${base}-$(rand_hex4).testnet"; do
    st="$(account_state "$cand")"
    case "$st" in
      missing) printf '%s' "$cand"; return 0 ;;
      exists)
        if [[ "${ROOT_EXISTING:-0}" == "1" && "$cand" == "${ROOT_ID:-pratala.testnet}" ]]; then
          printf '%s' "$cand"; return 0
        fi
        warn "$cand is taken — trying next fallback" ;;
      *) die "could not query $cand on $NEAR_NETWORK (RPC/network error) — retry later" ;;
    esac
  done
  die "all root candidates taken; set ROOT_ID=<name>.testnet"
}

ROOT="$(pick_root)"
SUFFIX="$(state_get '.actor_suffix')"
SUFFIX="${SUFFIX:-${ACTOR_SUFFIX:-$(rand_hex4)}}"
LOTS="lots.$ROOT"
PUSDC="pusdc.$ROOT"

actor_id() {
  local recorded
  recorded="$(state_get ".accounts.\"$1\"")"
  if [[ -n "$recorded" ]]; then printf '%s' "$recorded"; else printf 'pratala-%s-%s.testnet' "$1" "$SUFFIX"; fi
}

# 1 NEAR per 100 KB of wasm, plus headroom for state; never below the documented minimum.
fund_for_wasm() { # fund_for_wasm <wasm> <min NEAR> <headroom NEAR>
  local wasm="$1" min="$2" extra="$3" bytes
  if [[ -f "$wasm" ]]; then
    bytes="$(file_size "$wasm")"
    awk -v b="$bytes" -v m="$min" -v e="$extra" 'BEGIN{n=int((b+99999)/100000)+e; if(n<m)n=m; print n}'
  else
    printf '%s' "$min"
  fi
}
LOTS_FUND="$(fund_for_wasm "$LOTS_WASM" "$LOTS_MIN_NEAR" 3)"
PUSDC_FUND="$(fund_for_wasm "$PUSDC_WASM" "$PUSDC_MIN_NEAR" 1)"
[[ -f "$LOTS_WASM" ]] || warn "no $LOTS_WASM yet (run make -C smart-contract build for exact sizing) — using ${LOTS_FUND} NEAR"
[[ -f "$PUSDC_WASM" ]] || warn "no $PUSDC_WASM yet — using ${PUSDC_FUND} NEAR"

log ""
log "Plan (network: $NEAR_NETWORK, keys → $NEAR_KEYCHAIN):"
log "  root / owner / treasury : $ROOT   (faucet)"
for a in "${ACTORS[@]}"; do log "  $(printf '%-24s' "$a") : $(actor_id "$a")   (faucet)"; done
log "  lots contract           : $LOTS   (${LOTS_FUND} NEAR from root)"
log "  pusdc contract          : $PUSDC   (${PUSDC_FUND} NEAR from root)"
confirm "This creates up to 9 testnet accounts and moves testnet NEAR between them."

state_set_str '.actor_suffix' "$SUFFIX"

# --------------------------------------------------------------- creation ---
wait_exists() {
  local id="$1" i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    [[ "$(account_state "$id")" == "exists" ]] && return 0
    sleep "$i"
  done
  return 1
}

faucet_create() { # faucet_create <role> <account-id>
  local role="$1" id="$2" st
  st="$(account_state "$id")"
  if [[ "$st" == "exists" ]]; then
    if [[ -n "$(state_get ".accounts.\"$role\"")" || ( "$role" == "root" && "${ROOT_EXISTING:-0}" == "1" ) ]]; then
      ok "$role $id already exists — skipped"
      state_set_str ".accounts.\"$role\"" "$id"
      return 0
    fi
    die "$id exists but is not ours (not in $DEPLOY_FILE). Re-run with ACTOR_SUFFIX=<new 4 hex> or a different ROOT_ID."
  fi
  [[ "$st" == "missing" ]] || die "could not query $id (network error)"
  info "creating $role → $id via faucet"
  near_run "accounts.$role" account create-account sponsor-by-faucet-service "$id" \
    autogenerate-new-keypair "save-to-$NEAR_KEYCHAIN" network-config "$NEAR_NETWORK" create
  wait_exists "$id" || die "$id was not visible on-chain after creation"
  state_set_str ".accounts.\"$role\"" "$id"
  ok "$role $id created  $(explorer_account "$id")"
  sleep "$FAUCET_DELAY"
}

step "1/4 root"
faucet_create root "$ROOT"
state_set_str '.accounts.treasury' "$ROOT"

step "2/4 demo actors"
for a in "${ACTORS[@]}"; do faucet_create "$a" "$(actor_id "$a")"; done

step "3/4 root balance"
need="$(awk -v a="$LOTS_FUND" -v b="$PUSDC_FUND" -v r="$ROOT_RESERVE_NEAR" 'BEGIN{print a+b+r}')"
missing_subs=0
for s in "$LOTS" "$PUSDC"; do [[ "$(account_state "$s")" == "exists" ]] || missing_subs=1; done
have="$(near_free_balance "$ROOT")"
info "root free balance ${have} NEAR; sub-accounts need ${need} NEAR incl. ${ROOT_RESERVE_NEAR} reserve"
if (( missing_subs == 1 )) && float_lt "$have" "$need"; then
  short="$(awk -v n="$need" -v h="$have" 'BEGIN{printf "%.2f", n-h+0.05}')"
  warn "root is short by ${short} NEAR — topping up from demo actors (each keeps ≥ ${ACTOR_KEEP_NEAR} NEAR)"
  for a in coop1 warehouse1 agent1 investor2 farmer1 buyer1; do
    float_lt 0 "$short" || break
    id="$(actor_id "$a")"
    spare="$(awk -v f="$(near_free_balance "$id")" -v k="$ACTOR_KEEP_NEAR" 'BEGIN{s=f-k; if(s<0)s=0; printf "%.2f", s}')"
    float_lt 0.1 "$spare" || continue
    amt="$(awk -v s="$spare" -v n="$short" 'BEGIN{printf "%.2f", (s<n)?s:n}')"
    info "  $id → $ROOT  ${amt} NEAR"
    near_run "accounts.topup.$a" tokens "$id" send-near "$ROOT" "$amt NEAR" \
      network-config "$NEAR_NETWORK" "sign-with-$NEAR_KEYCHAIN" send
    short="$(awk -v s="$short" -v a="$amt" 'BEGIN{printf "%.2f", s-a}')"
  done
  float_lt 0 "$short" && die "root still short by ${short} NEAR — fund $ROOT from https://near-faucet.io and re-run"
  ok "root topped up"
else
  ok "root balance sufficient"
fi

step "4/4 contract sub-accounts"
sub_create() { # sub_create <role> <id> <NEAR>
  local role="$1" id="$2" amount="$3" st
  st="$(account_state "$id")"
  if [[ "$st" == "exists" ]]; then
    ok "$role $id already exists — skipped"
    state_set_str ".accounts.\"$role\"" "$id"
    return 0
  fi
  [[ "$st" == "missing" ]] || die "could not query $id (network error)"
  info "creating $id with ${amount} NEAR from $ROOT"
  near_run "accounts.$role" account create-account fund-myself "$id" "$amount NEAR" \
    autogenerate-new-keypair "save-to-$NEAR_KEYCHAIN" sign-as "$ROOT" \
    network-config "$NEAR_NETWORK" "sign-with-$NEAR_KEYCHAIN" send
  wait_exists "$id" || die "$id was not visible on-chain after creation"
  state_set_str ".accounts.\"$role\"" "$id"
  ok "$role $id created  $(explorer_account "$id")"
}
sub_create lots "$LOTS" "$LOTS_FUND"
sub_create pusdc "$PUSDC" "$PUSDC_FUND"

step "Accounts"
for r in root lots pusdc "${ACTORS[@]}"; do
  id="$(acct "$r")"
  log "  $(printf '%-10s %-40s %8s NEAR  %s' "$r" "$id" "$(near_balance "$id" | awk '{printf "%.2f",$1}')" "$(explorer_account "$id")")"
done
ok "accounts ready (written to ${DEPLOY_FILE#"$ROOT_DIR"/}) → next: scripts/03-deploy-contracts.sh"
