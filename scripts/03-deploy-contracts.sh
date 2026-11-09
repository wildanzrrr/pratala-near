#!/usr/bin/env bash
# Build and deploy pusdc + harvest-lot to the accounts from 02-create-accounts.sh.
#
#   scripts/03-deploy-contracts.sh            (asks "Proceed? [y/N]"; YES=1 skips)
#   SKIP_BUILD=1 scripts/03-deploy-contracts.sh   → reuse existing wasm in smart-contract/target/near
#   REDEPLOY=1 scripts/03-deploy-contracts.sh     → upgrade code on already-initialised contracts
#                                                  (deploy without init call; state is kept)
#
# Does:
#   1. make -C smart-contract build   → target/near/{pusdc,harvest_lot}/*.wasm
#   2. deploy pusdc with init new(owner_id=root, total_supply="1000000000000" (1,000,000 pUSDC),
#      metadata {ft-1.0.0, "Pratala Test USDC", "pUSDC", 6})
#   3. deploy lots with init new(owner_id=root, usdc_contract=pusdc, treasury=root, fee_bps=200)
#   4. keeps ≥ LOTS_STORAGE_POOL_NEAR (default 2) free on the lots account — verifier methods are
#      non-payable, so the contract pays attestation storage from this pool
#   5. records wasm hash/size, init args and tx hashes in deploy/testnet.json
#
# Expect: "✓ pusdc deployed", "✓ lots deployed", get_config printed, then env lines to paste
# into backend/.env and frontend/.env.local.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

require_testnet
require_near_cli_rs
require_cmd jq curl awk
state_init

ROOT="$(require_acct root)"
LOTS="$(require_acct lots)"
PUSDC="$(require_acct pusdc)"
TREASURY="$(acct treasury)"; TREASURY="${TREASURY:-$ROOT}"
FEE_BPS="${FEE_BPS:-200}"
TOTAL_SUPPLY="${TOTAL_SUPPLY:-1000000000000}"
LOTS_STORAGE_POOL_NEAR="${LOTS_STORAGE_POOL_NEAR:-2}"
LOTS_WASM="${LOTS_WASM:-$ROOT_DIR/smart-contract/target/near/harvest_lot/harvest_lot.wasm}"
PUSDC_WASM="${PUSDC_WASM:-$ROOT_DIR/smart-contract/target/near/pusdc/pusdc.wasm}"

step "Pratala contract deploy"
expect "pusdc + harvest-lot deployed and initialised on $NEAR_NETWORK; env lines printed at the end"

PUSDC_INIT="$(jq -cn --arg o "$ROOT" --arg s "$TOTAL_SUPPLY" \
  '{owner_id:$o, total_supply:$s, metadata:{spec:"ft-1.0.0", name:"Pratala Test USDC", symbol:"pUSDC", icon:null, reference:null, reference_hash:null, decimals:6}}')"
# INTERFACES.md §3: new(owner_id, usdc_contract, treasury, fee_bps). Override with LOTS_INIT_ARGS if the ABI changes.
LOTS_INIT="${LOTS_INIT_ARGS:-$(jq -cn --arg o "$ROOT" --arg u "$PUSDC" --arg t "$TREASURY" --argjson f "$FEE_BPS" \
  '{owner_id:$o, usdc_contract:$u, treasury:$t, fee_bps:$f}')}"

# ------------------------------------------------------------------ build ---
if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  step "1/5 build (make -C smart-contract build)"
  make -C "$ROOT_DIR/smart-contract" build
fi
for w in "$PUSDC_WASM" "$LOTS_WASM"; do
  [[ -f "$w" ]] || die "missing $w — build failed or the crate output path changed (set LOTS_WASM / PUSDC_WASM)"
  info "$(basename "$w"): $(file_size "$w") bytes, sha256 $(sha256_file "$w")"
done

initialised() { # initialised <contract> <view-method>
  has_code "$1" && near_view_json "$1" "$2" '{}' >/dev/null 2>&1
}

pusdc_state="new"; initialised "$PUSDC" ft_metadata && pusdc_state="initialised"
lots_state="new";  initialised "$LOTS" get_config && lots_state="initialised"

log ""
log "Plan (network: $NEAR_NETWORK):"
log "  pusdc → $PUSDC  [$pusdc_state]  init: $PUSDC_INIT"
log "  lots  → $LOTS  [$lots_state]  init: $LOTS_INIT"
log "  storage pool on $LOTS ≥ ${LOTS_STORAGE_POOL_NEAR} NEAR free (top-up from $ROOT)"
[[ "${REDEPLOY:-0}" == "1" ]] && log "  REDEPLOY=1: initialised contracts get new code without init (state kept)"
confirm "This deploys contract code to testnet and may transfer testnet NEAR from $ROOT."

record_contract() { # record_contract <key> <id> <wasm> <init-json>
  local key="$1" id="$2" wasm="$3" init="$4" rel
  rel="${wasm#"$ROOT_DIR"/}"
  state_set ".contracts.\"$key\"" "$(jq -cn --arg id "$id" --arg w "$rel" --argjson b "$(file_size "$wasm")" \
    --arg h "$(sha256_file "$wasm")" --argjson i "$init" --arg tx "$(state_get ".txs.\"deploy.$key\"")" \
    '{account_id:$id, wasm:$w, wasm_bytes:$b, wasm_sha256:$h, init_args:$i, deploy_tx:$tx}')"
}

deploy() { # deploy <key> <id> <wasm> <init-json> <state> <view-to-verify>
  local key="$1" id="$2" wasm="$3" init="$4" st="$5" view="$6"
  if [[ "$st" == "initialised" ]]; then
    if [[ "${REDEPLOY:-0}" == "1" ]]; then
      info "upgrading code on $id (no init)"
      near_run "deploy.$key.upgrade" contract deploy "$id" use-file "$wasm" without-init-call \
        network-config "$NEAR_NETWORK" $(sign_with "$id") send
    else
      ok "$key already deployed and initialised on $id — skipped (REDEPLOY=1 to upgrade)"
      return 0
    fi
  else
    info "deploying $key → $id with init new"
    near_run "deploy.$key" contract deploy "$id" use-file "$wasm" with-init-call new json-args "$init" \
      prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config "$NEAR_NETWORK" $(sign_with "$id") send
  fi
  near_view_json "$id" "$view" '{}' >/dev/null || die "$id.$view failed after deploy — check $LOG_DIR"
  record_contract "$key" "$id" "$wasm" "$init"
  ok "$key deployed  $(explorer_account "$id")"
}

step "2/5 pusdc"
deploy pusdc "$PUSDC" "$PUSDC_WASM" "$PUSDC_INIT" "$pusdc_state" ft_metadata
meta="$(near_view_json "$PUSDC" ft_metadata)"
[[ "$(jq -r .symbol <<<"$meta")" == "pUSDC" && "$(jq -r .decimals <<<"$meta")" == "6" ]] \
  || die "unexpected ft_metadata: $meta"
ok "ft_metadata: $(jq -c '{name,symbol,decimals}' <<<"$meta")"

step "3/5 lots (harvest-lot)"
deploy lots "$LOTS" "$LOTS_WASM" "$LOTS_INIT" "$lots_state" get_config
cfg="$(near_view_json "$LOTS" get_config)"
info "get_config: $(jq -c . <<<"$cfg")"
[[ "$(jq -r .usdc_contract <<<"$cfg")" == "$PUSDC" ]] || die "lots.usdc_contract != $PUSDC"
[[ "$(jq -r .owner_id <<<"$cfg")" == "$ROOT" ]] || die "lots.owner_id != $ROOT"
[[ "$(jq -r .fee_bps <<<"$cfg")" == "$FEE_BPS" ]] || warn "fee_bps is $(jq -r .fee_bps <<<"$cfg"), expected $FEE_BPS"

step "4/5 lots storage pool"
free="$(near_free_balance "$LOTS")"
if float_lt "$free" "$LOTS_STORAGE_POOL_NEAR"; then
  amt="$(awk -v p="$LOTS_STORAGE_POOL_NEAR" -v f="$free" 'BEGIN{printf "%.2f", p-f+0.1}')"
  info "lots has ${free} NEAR free → sending ${amt} NEAR from $ROOT"
  near_run "deploy.lots.storage_pool" tokens "$ROOT" send-near "$LOTS" "$amt NEAR" \
    network-config "$NEAR_NETWORK" $(sign_with "$ROOT") send
else
  ok "lots has ${free} NEAR free for attestation storage"
fi

step "5/5 env lines"
log "# backend/.env"
cat <<EOF
NEAR_NETWORK=$NEAR_NETWORK
NEAR_RPC_URL=$NEAR_RPC_URL
LOTS_CONTRACT_ID=$LOTS
PUSDC_CONTRACT_ID=$PUSDC
EXPLORER_BASE=$EXPLORER_BASE
EOF
log "# frontend/.env.local"
cat <<EOF
NEXT_PUBLIC_NEAR_NETWORK=$NEAR_NETWORK
NEXT_PUBLIC_RPC_URL=$NEAR_RPC_URL
NEXT_PUBLIC_LOTS_CONTRACT_ID=$LOTS
NEXT_PUBLIC_PUSDC_CONTRACT_ID=$PUSDC
NEXT_PUBLIC_EXPLORER_BASE=$EXPLORER_BASE
EOF
ok "contracts deployed (recorded in ${DEPLOY_FILE#"$ROOT_DIR"/}) → next: scripts/04-seed-demo.sh"
