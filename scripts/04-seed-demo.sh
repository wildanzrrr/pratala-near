#!/usr/bin/env bash
# Seed the demo state on testnet with the exact numbers from docs/INTERFACES.md.
#
#   scripts/04-seed-demo.sh   (asks "Proceed? [y/N]"; YES=1 skips)
#
# 1. roles: agent1 FieldAgent, coop1 Coop, warehouse1 Warehouse (add_role by root)
# 2. pUSDC storage_deposit for every actor, root and the lots contract (paid by root)
# 3. buyer1 takes 1,000 pUSDC from the pUSDC faucet
# 4. lot-1 full lifecycle: register (rice IR64, Karawang, 1,000 kg) → attest_field → attest_coop →
#    list @ 0.45 pUSDC/kg → buyer1 funds 450 pUSDC (ft_transfer_call) → weigh_in 900 kg grade A →
#    claim_payout (farmer 396.90) → claim_fee (treasury 8.10) → buyer1 nft_transfer → investor2 →
#    claim_refund (investor2 45.00)
# 5. lot-2 left at Listed (judges can fund it), lot-3 left at FieldVerified (co-op can attest live)
#
# Every step checks on-chain state first, so re-running continues where it stopped.
# Every tx hash is written to deploy/testnet.json under .txs."seed.*".
#
# Expect: "✓ seed complete", lot-1 Settled with claims all "0", NFT lot-1 owned by investor2,
# then run scripts/05-verify-demo.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

require_testnet
require_near_cli_rs
require_cmd jq curl
state_init

ROOT="$(require_acct root)"
LOTS="$(require_acct lots)"
PUSDC="$(require_acct pusdc)"
FARMER="$(require_acct farmer1)"
AGENT="$(require_acct agent1)"
COOP="$(require_acct coop1)"
WAREHOUSE="$(require_acct warehouse1)"
BUYER="$(require_acct buyer1)"
INVESTOR="$(require_acct investor2)"

BUYER_FAUCET="${BUYER_FAUCET:-1000000000}"   # 1,000 pUSDC
HARVEST_MONTH="$(month_plus 2)"

step "Pratala demo seed"
expect "lot-1 Settled (396.90 / 8.10 / 45.00 paid out), lot-2 Listed, lot-3 FieldVerified"

near_view_json "$LOTS" get_config >/dev/null || die "$LOTS has no harvest-lot contract — run scripts/03-deploy-contracts.sh"
near_view_json "$PUSDC" ft_metadata >/dev/null || die "$PUSDC has no pusdc contract — run scripts/03-deploy-contracts.sh"

log ""
log "Plan (network: $NEAR_NETWORK, ~30 transactions, all signed from the local keychain):"
log "  roles → $AGENT FieldAgent, $COOP Coop, $WAREHOUSE Warehouse"
log "  pUSDC storage for 6 actors + $ROOT + $LOTS; faucet 1,000 pUSDC → $BUYER"
log "  lot-1 → Settled, lot-2 → Listed, lot-3 → FieldVerified (harvest month $HARVEST_MONTH)"
confirm "This sends testnet transactions from root, the demo actors and the contracts' owner."

# ----------------------------------------------------------------- helpers ---
status_rank() {
  case "$1" in
    Registered) echo 1 ;; FieldVerified) echo 2 ;; CoopVerified) echo 3 ;; Listed) echo 4 ;;
    Funded) echo 5 ;; Settled) echo 6 ;; Refunded|Cancelled) echo 9 ;;
    *) echo 0 ;;  # unknown / view failed: re-attempt the step; the contract rejects duplicates loudly
  esac
}
lot_json()  { near_view_json "$LOTS" get_lot "$(jq -cn --arg l "$1" '{lot_id:$l}')"; }
lot_field() { lot_json "$1" | jq -r "$2"; }
expect_status() { # expect_status <lot> <status>
  local got
  got="$(lot_field "$1" .status)"
  [[ "$got" == "$2" ]] || die "$1: expected status $2 after the last tx, got $got (see $LOG_DIR)"
  ok "$1 → $2"
}
pusdc_balance() { near_view "$PUSDC" ft_balance_of "$(jq -cn --arg a "$1" '{account_id:$a}')" | jq -r .; }
fixture_hash() { sha256_hex "pratala-demo/$1"; }

# ------------------------------------------------------------------- roles ---
step "1/5 roles"
grant_role() { # grant_role <role> <account>
  local role="$1" who="$2"
  if near_view "$LOTS" get_roles "$(jq -cn --arg a "$who" '{account_id:$a}')" | jq -e --arg r "$role" 'index($r) != null' >/dev/null; then
    ok "$who already has $role"
    return 0
  fi
  near_call "$ROOT" "$LOTS" add_role "$(jq -cn --arg r "$role" --arg a "$who" '{role:$r, account_id:$a}')" \
    '30 Tgas' '0 NEAR' "seed.role.$role"
}
grant_role FieldAgent "$AGENT"
grant_role Coop "$COOP"
grant_role Warehouse "$WAREHOUSE"

# ------------------------------------------------------------ pUSDC storage ---
step "2/5 pUSDC storage registration"
MIN_STORAGE="$(near_view "$PUSDC" storage_balance_bounds | jq -r .min)"
[[ "$MIN_STORAGE" =~ ^[0-9]+$ ]] || die "could not read storage_balance_bounds.min from $PUSDC"
info "storage_balance_bounds.min = $MIN_STORAGE yoctoNEAR"
for pair in "farmer1:$FARMER" "agent1:$AGENT" "coop1:$COOP" "warehouse1:$WAREHOUSE" \
            "buyer1:$BUYER" "investor2:$INVESTOR" "root:$ROOT" "lots:$LOTS"; do
  name="${pair%%:*}"; who="${pair#*:}"
  if [[ "$(near_view "$PUSDC" storage_balance_of "$(jq -cn --arg a "$who" '{account_id:$a}')")" != "null" ]]; then
    ok "$who registered on pUSDC"
    continue
  fi
  near_call "$ROOT" "$PUSDC" storage_deposit "$(jq -cn --arg a "$who" '{account_id:$a, registration_only:true}')" \
    '30 Tgas' "$MIN_STORAGE yoctoNEAR" "seed.storage.$name"
done

# ------------------------------------------------------------- buyer funds ---
step "3/5 buyer1 pUSDC"
bal="$(pusdc_balance "$BUYER")"; [[ "$bal" =~ ^[0-9]+$ ]] || bal=0
if (( bal >= 450000000 )) || [[ "$(state_get '.txs."seed.lot1.fund"')" != "" ]]; then
  ok "$BUYER holds $(fmt_pusdc "$bal") pUSDC"
else
  near_call "$BUYER" "$PUSDC" faucet "$(jq -cn --arg a "$BUYER_FAUCET" '{amount:$a}')" '30 Tgas' '0 NEAR' "seed.faucet.buyer1" \
    || near_call "$ROOT" "$PUSDC" mint "$(jq -cn --arg w "$BUYER" --arg a "$BUYER_FAUCET" '{account_id:$w, amount:$a}')" \
         '30 Tgas' '0 NEAR' "seed.mint.buyer1"
  ok "$BUYER now holds $(fmt_pusdc "$(pusdc_balance "$BUYER")") pUSDC"
fi

# ---------------------------------------------------------------- lot steps ---
# register_lot <key> <crop> <variety> <region> <kg> <area_m2> → echoes lot id
register_lot() {
  local key="$1" crop="$2" variety="$3" region="$4" kg="$5" area="$6" id args
  id="$(state_get ".lots.\"$key\".lot_id")"
  if [[ -n "$id" ]] && lot_json "$id" >/dev/null; then
    ok "$key already registered as $id ($(lot_field "$id" .status))" ; printf '%s' "$id"; return 0
  fi
  args="$(jq -cn --arg c "$crop" --arg v "$variety" --arg r "$region" --argjson kg "$kg" --arg m "$HARVEST_MONTH" \
    --arg p "$(fixture_hash "$key/plot-boundary")" --arg g "$(fixture_hash "$key/plot-gps")" --argjson a "$area" \
    '{crop:$c, variety:$v, region:$r, projected_kg:$kg, harvest_month:$m, plot_hash:$p, gps_hash:$g, area_m2:$a, media_uri:null}')"
  near_call "$FARMER" "$LOTS" register_lot "$args" '50 Tgas' '0.1 NEAR' "seed.$key.register" >&2
  id="$(grep -Eo 'lot-[0-9]+' "$LAST_CALL_OUT" | tail -n 1 || true)"
  if [[ -z "$id" ]]; then # fall back to the farmer's newest lot
    id="$(near_view "$LOTS" get_lots_by_farmer "$(jq -cn --arg a "$FARMER" '{account_id:$a}')" \
      | jq -r 'sort_by(.created_at_ms) | last | .lot_id // empty')"
  fi
  [[ -n "$id" ]] || die "register_lot sent but no lot id found (see $LAST_CALL_OUT)"
  state_set ".lots.\"$key\"" "$(jq -cn --arg id "$id" --arg c "$crop" --arg v "$variety" --arg r "$region" \
    --argjson kg "$kg" --arg m "$HARVEST_MONTH" '{lot_id:$id, crop:$c, variety:$v, region:$r, projected_kg:$kg, harvest_month:$m}')"
  ok "$key registered as $id" ; printf '%s' "$id"
}

attest_field() { # attest_field <key> <lot>
  local key="$1" id="$2"
  (( $(status_rank "$(lot_field "$id" .status)") >= 2 )) && { ok "$id field visit already attested"; return 0; }
  near_call "$AGENT" "$LOTS" attest_field "$(jq -cn --arg l "$id" --arg e "$(fixture_hash "$key/field-visit-photo")" \
    --arg g "$(fixture_hash "$key/plot-gps")" --arg ai "$(fixture_hash "$key/field-visit-ai-check")" \
    '{lot_id:$l, evidence_hash:$e, evidence_uri:null, gps_hash:$g, ai_check_hash:$ai, note:"Field visit: paddy at vegetative stage, plot boundary matches registration"}')" \
    '30 Tgas' '0 NEAR' "seed.$key.attest_field"
  expect_status "$id" FieldVerified
}

attest_coop() {
  local key="$1" id="$2"
  (( $(status_rank "$(lot_field "$id" .status)") >= 3 )) && { ok "$id co-op review already attested"; return 0; }
  near_call "$COOP" "$LOTS" attest_coop "$(jq -cn --arg l "$id" --arg e "$(fixture_hash "$key/coop-review")" \
    '{lot_id:$l, evidence_hash:$e, evidence_uri:null, note:"Gapoktan review: field record consistent with member register"}')" \
    '30 Tgas' '0 NEAR' "seed.$key.attest_coop"
  expect_status "$id" CoopVerified
}

list_lot() { # list_lot <key> <lot> <price_per_kg>
  local key="$1" id="$2" price="$3"
  (( $(status_rank "$(lot_field "$id" .status)") >= 4 )) && { ok "$id already listed"; return 0; }
  near_call "$FARMER" "$LOTS" list_lot "$(jq -cn --arg l "$id" --arg p "$price" '{lot_id:$l, price_per_kg:$p}')" \
    '30 Tgas' '0 NEAR' "seed.$key.list"
  expect_status "$id" Listed
}

# ------------------------------------------------------------------- lot-1 ---
step "4/5 lot-1 full lifecycle"
L1="$(register_lot lot1 rice IR64 "Karawang, Jawa Barat" 1000 2500)"
attest_field lot1 "$L1"
attest_coop lot1 "$L1"
list_lot lot1 "$L1" 450000

if (( $(status_rank "$(lot_field "$L1" .status)") < 5 )); then
  total="$(near_view "$LOTS" quote_funding "$(jq -cn --arg l "$L1" '{lot_id:$l}')" | jq -r .)"
  [[ "$total" == "450000000" ]] || die "$L1 quote_funding = $total, expected 450000000 (1,000 kg × 0.45 pUSDC)"
  info "$BUYER funds $L1 with $(fmt_pusdc "$total") pUSDC via pUSDC.ft_transfer_call"
  near_call "$BUYER" "$PUSDC" ft_transfer_call "$(jq -cn --arg r "$LOTS" --arg a "$total" --arg l "$L1" \
    '{receiver_id:$r, amount:$a, msg:({action:"fund", lot_id:$l} | tojson)}')" \
    '100 Tgas' '1 yoctoNEAR' "seed.lot1.fund"
  expect_status "$L1" Funded
  [[ "$(lot_field "$L1" .holder)" == "$BUYER" ]] || die "$L1 NFT did not move to $BUYER on funding"
  ok "$L1 NFT owner → $BUYER, escrow $(fmt_pusdc "$(lot_field "$L1" .escrow)") pUSDC"
else
  ok "$L1 already funded"
fi

if (( $(status_rank "$(lot_field "$L1" .status)") < 6 )); then
  near_call "$WAREHOUSE" "$LOTS" weigh_in "$(jq -cn --arg l "$L1" --arg e "$(fixture_hash "lot1/scale-ticket")" \
    --arg ai "$(fixture_hash "lot1/scale-ticket-ai-check")" \
    '{lot_id:$l, actual_kg:900, grade:"A", evidence_hash:$e, evidence_uri:null, ai_check_hash:$ai}')" \
    '30 Tgas' '0 NEAR' "seed.lot1.weigh_in"
  expect_status "$L1" Settled
  claims="$(lot_field "$L1" '.claims | tojson')"
  info "claims after weigh-in: $claims"
  [[ "$(jq -r .farmer <<<"$claims")" == "396900000" && "$(jq -r .treasury <<<"$claims")" == "8100000" \
     && "$(jq -r .holder <<<"$claims")" == "45000000" ]] || die "settlement claims differ from 396.90 / 8.10 / 45.00: $claims"
  ok "settlement: farmer 396.90, treasury 8.10, holder 45.00"
else
  ok "$L1 already settled"
fi

claim() { # claim <signer> <method> <claims-field> <tx-key>
  local signer="$1" method="$2" field="$3" key="$4" before
  before="$(lot_field "$L1" ".claims.$field")"
  if [[ "$before" == "0" ]]; then ok "$L1 $field claim already paid"; return 0; fi
  near_call "$signer" "$LOTS" "$method" "$(jq -cn --arg l "$L1" '{lot_id:$l}')" '60 Tgas' '0 NEAR' "$key"
  [[ "$(lot_field "$L1" ".claims.$field")" == "0" ]] \
    || die "$method did not pay out (claim restored — is the receiver registered on pUSDC?)"
  ok "$L1 $field claim paid: $(fmt_pusdc "$before") pUSDC → $signer"
}
claim "$FARMER" claim_payout farmer seed.lot1.claim_payout
claim "$ROOT" claim_fee treasury seed.lot1.claim_fee

if [[ "$(lot_field "$L1" .holder)" != "$INVESTOR" ]]; then
  near_call "$BUYER" "$LOTS" nft_transfer "$(jq -cn --arg r "$INVESTOR" --arg t "$L1" \
    '{receiver_id:$r, token_id:$t, memo:"secondary sale: refund right moves with the NFT"}')" \
    '30 Tgas' '1 yoctoNEAR' "seed.lot1.nft_transfer"
  [[ "$(lot_field "$L1" .holder)" == "$INVESTOR" ]] || die "$L1 NFT did not move to $INVESTOR"
  ok "$L1 NFT owner → $INVESTOR"
else
  ok "$L1 NFT already held by $INVESTOR"
fi
claim "$INVESTOR" claim_refund holder seed.lot1.claim_refund
state_set_str '.lots.lot1.target' Settled

# --------------------------------------------------------------- lot-2, -3 ---
step "5/5 lot-2 (Listed) and lot-3 (FieldVerified)"
L2="$(register_lot lot2 rice Ciherang "Subang, Jawa Barat" 800 2000)"
attest_field lot2 "$L2"
attest_coop lot2 "$L2"
list_lot lot2 "$L2" 450000
state_set_str '.lots.lot2.target' Listed

L3="$(register_lot lot3 corn "Bisi 18" "Lampung Selatan, Lampung" 1500 3000)"
attest_field lot3 "$L3"
state_set_str '.lots.lot3.target' FieldVerified

step "Seed transactions"
jq -r '.txs | to_entries[] | select(.key | startswith("seed.")) | "\(.key)\t\(.value)"' "$DEPLOY_FILE" \
  | while IFS=$'\t' read -r k h; do log "  $(printf '%-28s' "$k") $(explorer_tx "$h")"; done
ok "seed complete: $L1 Settled, $L2 Listed, $L3 FieldVerified → next: scripts/05-verify-demo.sh"
