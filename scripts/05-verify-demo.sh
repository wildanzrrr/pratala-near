#!/usr/bin/env bash
# Read-only check of the seeded demo against the README / INTERFACES.md numbers. Sends no transactions.
#
#   scripts/05-verify-demo.sh
#
# Prints: lots config + stats, lot-1..3 state, pUSDC balances (farmer1, investor2, treasury/root,
# lots contract, buyer1), explorer links. Asserts:
#   - lot-1 status Settled, 1,000 kg projected, 900 kg delivered at 0.45 pUSDC/kg, 450 pUSDC escrow
#   - settlement math: farmer 396.90, treasury 8.10, holder refund 45.00 (from the on-chain lot fields)
#   - every lot-1 claim paid ("0" remaining) and the payout_claimed events in the claim txs carry
#     those exact amounts with ok=true (archival RPC; falls back to balances if the tx is unavailable)
#   - NFT lot-1 is owned by investor2 (nft_token and lot.holder)
#
# Exit 0 = all ✓; exit 1 = a mismatch or the contracts are not reachable; exit 2 = not deployed yet.
# Ids come from deploy/testnet.json (override with DEPLOY_FILE, or LOTS_CONTRACT_ID / PUSDC_CONTRACT_ID).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

require_cmd jq curl

step "Pratala demo verification (read-only, $NEAR_NETWORK)"
expect "every line ✓ and 'all checks passed'; lot-1 Settled 396.90 / 8.10 / 45.00, NFT owner investor2"

if [[ ! -f "$DEPLOY_FILE" ]]; then
  err "no ${DEPLOY_FILE#"$ROOT_DIR"/} — nothing deployed yet. Run scripts/02-create-accounts.sh, 03-deploy-contracts.sh, 04-seed-demo.sh first."
  exit 2
fi
require_near_cli_rs

LOTS="$(acct lots)"; PUSDC="$(acct pusdc)"; ROOT="$(acct root)"
FARMER="$(acct farmer1)"; BUYER="$(acct buyer1)"; INVESTOR="$(acct investor2)"
TREASURY="$(acct treasury)"; TREASURY="${TREASURY:-$ROOT}"
if [[ -z "$LOTS" || -z "$PUSDC" ]]; then
  err "deploy/testnet.json has no lots/pusdc ids — run scripts/02-create-accounts.sh and 03-deploy-contracts.sh"
  exit 2
fi

fails=0
pass() { ok "$*"; }
fail() { err "$*"; fails=$((fails + 1)); }
check_eq() { # check_eq <label> <got> <want>
  if [[ "$2" == "$3" ]]; then pass "$1 = $3"; else fail "$1: got '$2', want '$3'"; fi
}

if ! CONFIG="$(near_view_json "$LOTS" get_config)"; then
  err "cannot read $LOTS.get_config — contract not deployed or RPC unreachable: $(last_view_error)"
  exit 1
fi
if ! META="$(near_view_json "$PUSDC" ft_metadata)"; then
  err "cannot read $PUSDC.ft_metadata — pUSDC not deployed: $(last_view_error)"
  exit 1
fi

step "Contracts"
log "  lots   $LOTS  $(explorer_account "$LOTS")"
log "  pusdc  $PUSDC  $(explorer_account "$PUSDC")  $(jq -c '{symbol,decimals}' <<<"$META")"
log "  config $(jq -c . <<<"$CONFIG")"
STATS="$(near_view_json "$LOTS" get_stats || echo '{}')"
log "  stats  $(jq -c . <<<"$STATS")"
FEE_BPS="$(jq -r .fee_bps <<<"$CONFIG")"

step "Lots"
lot_id_for() { local v; v="$(state_get ".lots.\"$1\".lot_id")"; printf '%s' "${v:-lot-${1#lot}}"; }
L1="$(lot_id_for lot1)"; L2="$(lot_id_for lot2)"; L3="$(lot_id_for lot3)"
for id in "$L1" "$L2" "$L3"; do
  if j="$(near_view_json "$LOTS" get_lot "$(jq -cn --arg l "$id" '{lot_id:$l}')")"; then
    log "  $(jq -r '"\(.lot_id)  \(.status)  \(.crop)/\(.variety // "-")  \(.region)  \(.projected_kg) kg  price \(.price_per_kg)/kg  escrow \(.escrow)  holder \(.holder)  claims \(.claims|tojson)  attestations \(.attestations|length)"' <<<"$j")"
  else
    log "  $id  (not found)"
  fi
done

LOT1="$(near_view_json "$LOTS" get_lot "$(jq -cn --arg l "$L1" '{lot_id:$l}')" || true)"
if [[ -z "$LOT1" ]]; then
  fail "$L1 does not exist — run scripts/04-seed-demo.sh"
else
  step "lot-1 assertions"
  check_eq "$L1 status" "$(jq -r .status <<<"$LOT1")" Settled
  check_eq "$L1 projected_kg" "$(jq -r .projected_kg <<<"$LOT1")" 1000
  check_eq "$L1 actual_kg" "$(jq -r .actual_kg <<<"$LOT1")" 900
  check_eq "$L1 grade" "$(jq -r .grade <<<"$LOT1")" A
  check_eq "$L1 price_per_kg" "$(jq -r .price_per_kg <<<"$LOT1")" 450000
  check_eq "$L1 funding_total" "$(jq -r .funding_total <<<"$LOT1")" 450000000
  check_eq "$L1 attestations (field, coop, weigh-in)" "$(jq -r '[.attestations[].kind] | join(",")' <<<"$LOT1")" "FieldVisit,CoopReview,WarehouseWeighIn"

  # Settlement math recomputed from on-chain fields (all values fit in 64-bit).
  projected="$(jq -r .projected_kg <<<"$LOT1")"; actual="$(jq -r '.actual_kg // 0' <<<"$LOT1")"
  price="$(jq -r .price_per_kg <<<"$LOT1")"; total="$(jq -r .funding_total <<<"$LOT1")"
  if [[ "$projected$actual$price$total$FEE_BPS" =~ ^[0-9]+$ ]]; then
    delivered=$(( actual < projected ? actual : projected ))
    gross=$(( delivered * price )); fee=$(( gross * FEE_BPS / 10000 ))
    check_eq "farmer payout (gross − fee)" "$(fmt_pusdc $((gross - fee)))" 396.90
    check_eq "treasury fee (${FEE_BPS} bps)" "$(fmt_pusdc "$fee")" 8.10
    check_eq "holder refund (escrow − gross)" "$(fmt_pusdc $((total - gross)))" 45.00
  else
    fail "lot-1 numeric fields missing; cannot recompute settlement"
  fi
  check_eq "remaining claims" "$(jq -c '.claims' <<<"$LOT1")" '{"farmer":"0","holder":"0","treasury":"0"}'
  check_eq "$L1 holder (lot view)" "$(jq -r .holder <<<"$LOT1")" "$INVESTOR"
  nft_owner="$(near_view "$LOTS" nft_token "$(jq -cn --arg t "$L1" '{token_id:$t}')" | jq -r '.owner_id // "none"' || echo error)"
  check_eq "$L1 NFT owner (nft_token)" "$nft_owner" "$INVESTOR"

  step "payout events (from the claim transactions)"
  # payout_event <tx-key> <signer> <kind> <amount> <to> → 0 found, 1 mismatch, 2 tx unavailable
  payout_event() {
    local key="$1" signer="$2" kind="$3" amount="$4" to="$5" hash resp url
    hash="$(state_get ".txs.\"$key\"")"
    [[ -n "$hash" ]] || return 2
    for url in "$NEAR_ARCHIVAL_RPC_URL" "$NEAR_RPC_URL"; do
      resp="$(rpc tx "$(jq -cn --arg h "$hash" --arg s "$signer" '{tx_hash:$h, sender_account_id:$s, wait_until:"FINAL"}')" "$url" 2>/dev/null || true)"
      [[ -n "$resp" ]] && jq -e '.result' >/dev/null 2>&1 <<<"$resp" && break
      resp=""
    done
    [[ -n "$resp" ]] || return 2
    jq -e --arg k "$kind" --arg a "$amount" --arg t "$to" '
      [.result.receipts_outcome[].outcome.logs[] | select(startswith("EVENT_JSON:")) | .[11:] | fromjson
       | select(.standard == "pratala" and .event == "payout_claimed") | .data[]
       | select(.kind == $k and .amount == $a and .to == $t and .ok == true)] | length > 0' >/dev/null <<<"$resp"
  }
  check_payout() { # check_payout <label> <tx-key> <signer> <kind> <amount> <to> <fallback-balance-account>
    local rc=0 bal
    payout_event "$2" "$3" "$4" "$5" "$6" || rc=$?
    case $rc in
      0) pass "$1: payout_claimed {kind:$4, amount:$5, to:$6, ok:true}  $(explorer_tx "$(state_get ".txs.\"$2\"")")" ;;
      1) fail "$1: tx $(state_get ".txs.\"$2\"") has no matching payout_claimed event" ;;
      *) bal="$(near_view "$PUSDC" ft_balance_of "$(jq -cn --arg a "$7" '{account_id:$a}')" | jq -r . || echo 0)"
         if [[ "$bal" =~ ^[0-9]+$ ]] && (( bal >= $5 )); then
           warn "$1: claim tx not retrievable from RPC; fallback balance check $7 holds $(fmt_pusdc "$bal") ≥ $(fmt_pusdc "$5")"
         else
           fail "$1: claim tx not retrievable and $7 holds only $(fmt_pusdc "${bal:-0}") pUSDC"
         fi ;;
    esac
  }
  check_payout "farmer received 396.90" seed.lot1.claim_payout "$FARMER" Farmer 396900000 "$FARMER" "$FARMER"
  check_payout "treasury received 8.10" seed.lot1.claim_fee "$ROOT" Treasury 8100000 "$TREASURY" "$TREASURY"
  check_payout "investor2 refund 45.00" seed.lot1.claim_refund "$INVESTOR" Holder 45000000 "$INVESTOR" "$INVESTOR"
fi

step "pUSDC balances"
for pair in "farmer1:$FARMER" "investor2:$INVESTOR" "treasury:$TREASURY" "lots contract:$LOTS" "buyer1:$BUYER"; do
  name="${pair%%:*}"; who="${pair#*:}"
  [[ -n "$who" ]] || continue
  bal="$(near_view "$PUSDC" ft_balance_of "$(jq -cn --arg a "$who" '{account_id:$a}')" | jq -r . 2>/dev/null || echo '?')"
  log "  $(printf '%-14s %-42s %14s pUSDC' "$name" "$who" "$(fmt_pusdc "$bal")")"
done

step "lot-2 / lot-3 (live demo lots)"
for pair in "$L2:Listed" "$L3:FieldVerified"; do
  id="${pair%%:*}"; want="${pair#*:}"
  got="$(near_view_json "$LOTS" get_lot "$(jq -cn --arg l "$id" '{lot_id:$l}')" | jq -r .status 2>/dev/null || echo missing)"
  if [[ "$got" == "$want" ]]; then ok "$id $got"; else warn "$id is $got (seeded as $want; a judge may have advanced it)"; fi
done

step "Explorer"
log "  lots contract   $(explorer_account "$LOTS")"
log "  pUSDC contract  $(explorer_account "$PUSDC")"
jq -r '.txs // {} | to_entries[] | select(.key | startswith("seed.lot1.") or startswith("deploy.")) | "\(.key)\t\(.value)"' "$DEPLOY_FILE" \
  | while IFS=$'\t' read -r k h; do log "  $(printf '%-26s' "$k") $(explorer_tx "$h")"; done

log ""
if (( fails > 0 )); then
  err "$fails check(s) failed"
  exit 1
fi
ok "all checks passed"
