#!/usr/bin/env bash
# Deploy the fractional harvest-lot contract to MAINNET (lots.pratala.near) against native USDC.
#
#   scripts/07-mainnet-deploy.sh          (asks "Proceed? [y/N]"; YES=1 skips)
#   SKIP_BUILD=1 scripts/07-mainnet-deploy.sh   → reuse the wasm in smart-contract/target/near
#   REDEPLOY=1   …                         → code-only upgrade on an initialised contract (no init)
#
# Does:
#   1. make -C smart-contract build        → target/near/harvest_lot/harvest_lot.wasm
#   2. refuses to run if lots.pratala.near cannot cover the wasm storage stake
#      (bytes × 0.00001 NEAR; ≈3.93 NEAR for the 392.6 KB fractional build) + margin
#   3. deploys with init new(owner_id=root, usdc_contract=native USDC, treasury, fee_bps=200)
#      — NO pUSDC contract on mainnet: escrow runs on native Circle USDC (6 dp)
#   4. storage_deposit on USDC for the lots contract AND the treasury (flat 0.00125 NEAR each,
#      paid by root) — without these, funding and fee claims fail-and-restore forever
#   5. records wasm hash/size/init args + tx hashes in deploy/mainnet.json and prints the
#      backend/.env + frontend/.env.local lines
#
# Expect: "✓ lots live on mainnet", get_config printed matching INTERFACES §1, env lines at the end.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Must precede sourcing lib.sh: the defaults there are testnet.
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL="${NEAR_RPC_URL:-https://rpc.fastnear.com}"
export NEAR_ARCHIVAL_RPC_URL="${NEAR_ARCHIVAL_RPC_URL:-https://archival-rpc.fastnear.com}"
export EXPLORER_BASE="${EXPLORER_BASE:-https://nearblocks.io}"
export DEPLOY_FILE="${DEPLOY_FILE:-$SCRIPT_DIR/../deploy/mainnet.json}"

# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

require_near_cli_rs
require_cmd jq
state_init

ROOT="$(require_acct root)"
LOTS="$(require_acct lots)"
SPONSOR="$(acct sponsor)"; SPONSOR="${SPONSOR:-sponsor.$ROOT}"
TREASURY="$(acct treasury)"; TREASURY="${TREASURY:-$ROOT}"
USDC="$(state_get '.contracts.usdc.account_id')"
USDC="${USDC:-17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1}"
FEE_BPS="${FEE_BPS:-200}"
LOTS_WASM="${LOTS_WASM:-$ROOT_DIR/smart-contract/target/near/harvest_lot/harvest_lot.wasm}"
STAKE_MARGIN_NEAR="${STAKE_MARGIN_NEAR:-0.15}"

step "Pratala mainnet deploy (harvest-lot → $LOTS)"
expect "$LOTS live with init new(owner=$ROOT, usdc=native USDC, treasury=$TREASURY, fee_bps=$FEE_BPS); USDC storage for lots + treasury"

# ------------------------------------------------------------------ build ---
if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  step "1/5 build (make -C smart-contract build)"
  make -C "$ROOT_DIR/smart-contract" build
fi
[[ -f "$LOTS_WASM" ]] || die "missing $LOTS_WASM — build failed or set LOTS_WASM"
BYTES="$(file_size "$LOTS_WASM")"
STAKE="$(awk -v b="$BYTES" 'BEGIN{printf "%.3f", b/100000}')"
info "wasm: $BYTES bytes, sha256 $(sha256_file "$LOTS_WASM") → storage stake ≈ $STAKE NEAR"

# ------------------------------------------------------------ preflight ---
step "2/5 preflight"
meta="$(near_view_json "$USDC" ft_metadata)" || die "cannot read ft_metadata on $USDC — is that the native USDC contract?"
[[ "$(jq -r .decimals <<<"$meta")" == "6" && "$(jq -r .symbol <<<"$meta")" == "USDC" ]] \
  || die "unexpected token at $USDC: $(jq -c '{symbol,decimals}' <<<"$meta") — wanted native USDC (6 dp), NOT usdc.tkn.near (wUSDC, 18 dp)"
ok "USDC verified: $(jq -c '{symbol,decimals}' <<<"$meta")"

free="$(near_free_balance "$LOTS")"
need="$(awk -v s="$STAKE" -v m="$STAKE_MARGIN_NEAR" 'BEGIN{printf "%.2f", s+m}')"
info "$LOTS free balance: ${free} NEAR (need ≥ ${need}: stake + margin)"
float_lt "$free" "$need" && die "top up $LOTS by ≈ $(awk -v f="$free" -v n="$need" 'BEGIN{printf "%.2f", n-f}') NEAR first (send from $ROOT)"

initialised() { has_code "$LOTS" && near_view_json "$LOTS" get_config '{}' >/dev/null 2>&1; }
state=init
initialised && state=initialised
[[ "$state" == "initialised" && "${REDEPLOY:-0}" != "1" ]] \
  && die "$LOTS already has a initialised contract — re-run with REDEPLOY=1 for a code-only upgrade"

LOTS_INIT="$(jq -cn --arg o "$ROOT" --arg u "$USDC" --arg t "$TREASURY" --argjson f "$FEE_BPS" \
  '{owner_id:$o, usdc_contract:$u, treasury:$t, fee_bps:$f}')"

log ""
log "Plan (network: $NEAR_NETWORK):"
log "  lots  → $LOTS  [$state]  init: $LOTS_INIT"
log "  USDC storage_deposit (flat min) for: $LOTS, $TREASURY — paid by $ROOT"
confirm "This deploys the contract to MAINNET and moves real NEAR (gas + 2× USDC storage)."

# ---------------------------------------------------------------- deploy ---
step "3/5 deploy lots"
if [[ "$state" == "initialised" ]]; then
  near_run "deploy.lots.upgrade" contract deploy "$LOTS" use-file "$LOTS_WASM" without-init-call \
    network-config "$NEAR_NETWORK" $(sign_with "$LOTS") send
else
  near_run "deploy.lots" contract deploy "$LOTS" use-file "$LOTS_WASM" with-init-call new json-args "$LOTS_INIT" \
    prepaid-gas '300 Tgas' attached-deposit '0 NEAR' network-config "$NEAR_NETWORK" $(sign_with "$LOTS") send
fi
cfg="$(near_view_json "$LOTS" get_config)" || die "get_config failed after deploy — see $LOG_DIR"
info "get_config: $(jq -c . <<<"$cfg")"
[[ "$(jq -r .usdc_contract <<<"$cfg")" == "$USDC" ]]      || die "lots.usdc_contract != $USDC"
[[ "$(jq -r .owner_id <<<"$cfg")" == "$ROOT" ]]           || die "lots.owner_id != $ROOT"
[[ "$(jq -r .treasury <<<"$cfg")" == "$TREASURY" ]]       || die "lots.treasury != $TREASURY"
[[ "$(jq -r .fee_bps <<<"$cfg")" == "$FEE_BPS" ]]         || warn "fee_bps is $(jq -r .fee_bps <<<"$cfg"), expected $FEE_BPS"

state_set ".contracts.lots" "$(jq -cn --arg id "$LOTS" --arg w "smart-contract/target/near/harvest_lot/harvest_lot.wasm" \
  --argjson b "$BYTES" --arg h "$(sha256_file "$LOTS_WASM")" --argjson i "$LOTS_INIT" \
  --arg tx "$(state_get '.txs."deploy.lots"')" --arg tx2 "$(state_get '.txs."deploy.lots.upgrade"')" \
  '{account_id:$id, wasm:$w, wasm_bytes:$b, wasm_sha256:$h, init_args:$i, deploy_tx:($tx // $tx2)}')"
ok "$LOTS live  $(explorer_account "$LOTS")"

# ------------------------------------------------------- USDC storage ------
step "4/5 USDC storage registration (lots + treasury)"
MIN_STORAGE="$(near_view "$USDC" storage_balance_bounds | jq -r .min)"
[[ "$MIN_STORAGE" =~ ^[0-9]+$ ]] || die "could not read storage_balance_bounds.min from $USDC"
registered_on_usdc() {
  [[ "$(near_view "$USDC" storage_balance_of "$(jq -cn --arg a "$1" '{account_id:$a}')")" != "null" ]]
}
for who in "$LOTS" "$TREASURY"; do
  if registered_on_usdc "$who"; then
    ok "$who already registered on USDC"
    continue
  fi
  near_call "$ROOT" "$USDC" storage_deposit "$(jq -cn --arg a "$who" '{account_id:$a, registration_only:true}')" \
    '30 Tgas' "${MIN_STORAGE} yoctoNEAR" "mainnet.usdc_storage.${who%%.*}"
  registered_on_usdc "$who" || die "$who still not registered on USDC — check $LOG_DIR"
  ok "$who registered on USDC"
done

# ------------------------------------------------------------------ env ---
step "5/5 env lines"
log "# backend/.env"
cat <<EOF
NEAR_NETWORK=$NEAR_NETWORK
NEAR_RPC_URL=$NEAR_RPC_URL
LOTS_CONTRACT_ID=$LOTS
PUSDC_CONTRACT_ID=$USDC
EXPLORER_BASE=$EXPLORER_BASE
FASTAUTH_CONTRACT_ID=fast-auth.near
FASTAUTH_MPC_CONTRACT_ID=v1.signer
FASTAUTH_AUTH0_DOMAIN=login.auth.near.org
FASTAUTH_AUTH0_AUDIENCE=https://api.auth.near.org
SPONSOR_ACCOUNT_ID=$SPONSOR
SPONSOR_PRIVATE_KEY_FILE=../config/keys/$SPONSOR.json
EOF
log "# frontend/.env.local"
cat <<EOF
NEXT_PUBLIC_NEAR_NETWORK=$NEAR_NETWORK
NEXT_PUBLIC_RPC_URL=$NEAR_RPC_URL
NEXT_PUBLIC_LOTS_CONTRACT_ID=$LOTS
NEXT_PUBLIC_PUSDC_CONTRACT_ID=$USDC
NEXT_PUBLIC_EXPLORER_BASE=$EXPLORER_BASE
NEXT_PUBLIC_AUTH_RECIPIENT=$LOTS
NEXT_PUBLIC_SSO_ACCOUNT_ROOT=$SPONSOR
NEXT_PUBLIC_FASTAUTH_CONTRACT_ID=fast-auth.near
NEXT_PUBLIC_FASTAUTH_MPC_CONTRACT_ID=v1.signer
NEXT_PUBLIC_FASTAUTH_AUTH0_DOMAIN=login.auth.near.org
NEXT_PUBLIC_FASTAUTH_API_AUDIENCE=https://api.auth.near.org
NEXT_PUBLIC_FASTAUTH_CLIENT_ID=<mainnet client id — register at docs.auth.near.org>
EOF
log ""
warn "lots still has its full-access key in config/keys — keeping it allows REDEPLOY; deleting it makes the contract immutable (recommended before real funds):"
log "  near account delete-key $LOTS 'ed25519:<lots public key>' … network-config mainnet sign-as $LOTS …"
ok "mainnet deploy recorded in ${DEPLOY_FILE#"$ROOT_DIR"/} → next: grant roles, then point backend + frontend at the env lines above"
