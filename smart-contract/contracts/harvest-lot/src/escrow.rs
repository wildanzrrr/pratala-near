//! Escrow: kg-denominated funding through NEP-141 `ft_transfer_call`, settlement math, and
//! pull-model claims (farmer / per-share holder / treasury).
//!
//! Claim safety (reentrancy / callback rules from the near-smart-contracts skill):
//! 1. All checks, then state is written *before* the `ft_transfer` promise: the claim is
//!    deducted (and `claim_lock` set, and the share marked claimed) so a second claim or an
//!    NFT transfer cannot race the payout.
//! 2. `on_claim_resolved` is `#[private]`, reads the result with `#[callback_result]`, never
//!    panics, always clears the lock, and restores the claim if the transfer failed.

use near_contract_standards::fungible_token::core::ext_ft_core;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::non_fungible_token::TokenId;
use near_contract_standards::non_fungible_token::events::NftMint;
use near_contract_standards::non_fungible_token::metadata::TokenMetadata;
use near_sdk::json_types::U128;
use near_sdk::{
    AccountId, Gas, NearToken, Promise, PromiseError, PromiseOrValue, env, near, require,
    serde_json,
};

use crate::errors::*;
use crate::events::{LotFunded, LotFundingClosed, PayoutClaimed, PratalaEvent};
use crate::storage::share_lot_id;
use crate::types::{ClaimKind, Settlement, Share, Status, TransferMsg};
use crate::validate;
use crate::{Contract, ContractExt, MAX_SHARES_PER_LOT};

pub const BPS_DENOMINATOR: u128 = 10_000;
pub const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(15);
pub const GAS_FOR_ON_CLAIM: Gas = Gas::from_tgas(10);
/// Transfer + callback + the claim call's own execution.
pub const MIN_GAS_FOR_CLAIM: Gas = Gas::from_tgas(40);

/// Settlement formula from `docs/INTERFACES.md` §3:
/// `delivered = min(actual, sold)`, `gross = delivered × price`,
/// `fee = floor(gross × fee_bps / 10_000)`, `farmer = gross − fee`,
/// `holder_pool = escrow − gross`. Each share NFT then claims
/// `floor(holder_pool × kg / sold_kg)` and the rounding dust joins the treasury claim, so the
/// parts always sum to `escrow`. Over-delivery is capped at the sold kg: buyers only paid for
/// those. Flooring the fee rounds in the farmer's favour.
pub fn compute_settlement(
    sold_kg: u64,
    actual_kg: u64,
    price_per_kg: u128,
    escrow: u128,
    fee_bps: u16,
    shares: &[Share],
) -> Settlement {
    let delivered_kg = actual_kg.min(sold_kg);
    let gross = validate::funding_total(delivered_kg, price_per_kg);
    let fee = gross
        .checked_mul(fee_bps as u128)
        .unwrap_or_else(|| env::panic_str(ERR_OVERFLOW))
        / BPS_DENOMINATOR;
    let farmer = gross - fee;
    let holder_pool = escrow
        .checked_sub(gross)
        .unwrap_or_else(|| env::panic_str(ERR_OVERFLOW));
    let (holder, dust) = holder_split(holder_pool, sold_kg, shares);
    Settlement {
        delivered_kg,
        gross,
        farmer,
        treasury: fee + dust,
        holder,
        holder_pool,
        dust,
    }
}

/// Per-share floor entitlements against `pool`. Returns `(sum, dust)` with `sum + dust == pool`
/// (share kg always sum to `sold_kg`), so no base unit is lost to rounding.
pub fn holder_split(pool: u128, sold_kg: u64, shares: &[Share]) -> (u128, u128) {
    if sold_kg == 0 {
        return (0, pool);
    }
    let mut sum = 0u128;
    for share in shares {
        sum = sum
            .checked_add(share_entitlement(pool, share.kg, sold_kg))
            .unwrap_or_else(|| env::panic_str(ERR_OVERFLOW));
    }
    let dust = pool
        .checked_sub(sum)
        .unwrap_or_else(|| env::panic_str(ERR_OVERFLOW));
    (sum, dust)
}

/// `floor(pool × kg / sold_kg)` — evaluated identically at settlement and claim time, so a
/// share always receives exactly the amount reserved for it.
pub fn share_entitlement(pool: u128, kg: u64, sold_kg: u64) -> u128 {
    pool.checked_mul(kg as u128)
        .unwrap_or_else(|| env::panic_str(ERR_OVERFLOW))
        / sold_kg as u128
}

#[near]
impl FungibleTokenReceiver for Contract {
    /// Buys `kg` of a Listed lot for `sender_id`, who receives a share NFT for those kg:
    /// `msg = {"action":"fund","lot_id":"lot-1","kg":300}`. Any panic here makes the FT
    /// contract refund the whole `amount` to `sender_id`; on success the unused excess is
    /// returned for refund.
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::predecessor_account_id() == self.usdc_contract,
            ERR_WRONG_TOKEN
        );
        self.assert_not_paused();
        let TransferMsg::Fund { lot_id, kg } =
            serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str(ERR_BAD_MSG));
        require!(kg > 0, ERR_ZERO_KG);

        let mut lot = self.lot(&lot_id);
        require!(lot.status == Status::Listed, ERR_BAD_STATUS);
        require!(sender_id != lot.farmer_id, ERR_FUNDER_IS_FARMER);
        require!(lot.shares.len() < MAX_SHARES_PER_LOT, ERR_MAX_SHARES);
        require!(kg <= lot.remaining_kg(), ERR_OVER_REMAINING);
        let cost = validate::funding_total(kg, lot.price_per_kg);
        require!(amount.0 >= cost, ERR_UNDERFUNDED);

        let share_id = format!("{lot_id}:{}", lot.next_share_no);
        lot.next_share_no += 1;
        lot.sold_kg += kg; // kg ≤ remaining ⇒ sold_kg stays ≤ projected_kg
        lot.escrow = lot
            .escrow
            .checked_add(cost)
            .unwrap_or_else(|| env::panic_str(ERR_OVERFLOW));
        if lot.funded_at_ms.is_none() {
            lot.funded_at_ms = Some(env::block_timestamp_ms());
            lot.fee_bps = self.fee_bps;
        }
        let sold_out = lot.sold_kg == lot.projected_kg;
        if sold_out {
            lot.status = Status::Funded;
        }
        lot.shares.push(Share {
            share_id: share_id.clone(),
            kg,
            claimed: false,
        });
        let sold_kg = lot.sold_kg;
        let metadata = share_metadata(&lot_id, kg, &lot.crop, lot.price_per_kg);
        self.save_lot(lot);
        if sold_out {
            self.counters.funded_lots += 1;
        }

        // Share NFT storage is contract-paid out of the reserve collected at registration;
        // `refund_id: None` keeps it that way (the predecessor here is the pUSDC contract).
        // `internal_mint_with_refund` does not emit, so the mint event is emitted here.
        self.tokens.internal_mint_with_refund(
            share_id.clone(),
            sender_id.clone(),
            Some(metadata),
            None,
        );
        NftMint {
            owner_id: &sender_id,
            token_ids: &[&share_id],
            memo: None,
        }
        .emit();
        PratalaEvent::LotFunded(vec![LotFunded {
            lot_id: lot_id.clone(),
            buyer: sender_id.clone(),
            kg,
            amount: U128(cost),
            refund: U128(amount.0 - cost),
            sold_kg,
            share_id: share_id.clone(),
        }])
        .emit();
        if sold_out {
            PratalaEvent::LotFundingClosed(vec![LotFundingClosed {
                lot_id,
                sold_kg,
                projected_kg: sold_kg,
                closed_by: sender_id,
            }])
            .emit();
        }
        PromiseOrValue::Value(U128(amount.0 - cost))
    }
}

#[near]
impl Contract {
    /// Farmer pulls `claims.farmer` after weigh-in.
    pub fn claim_payout(&mut self, lot_id: TokenId) -> Promise {
        let lot = self.lot(&lot_id);
        self.assert_farmer(&lot);
        let to = lot.farmer_id.clone();
        let amount = lot.claims.get(ClaimKind::Farmer);
        self.start_claim(lot_id, ClaimKind::Farmer, to, amount, None)
    }

    /// Whoever owns a share NFT *now* pulls that share's refund entitlement
    /// (under-delivery or crop failure). Each share claims exactly once.
    pub fn claim_refund(&mut self, share_id: TokenId) -> Promise {
        let lot_id = share_lot_id(&share_id).unwrap_or_else(|| env::panic_str(ERR_SHARE_NOT_FOUND));
        let owner = self.share_owner(&share_id);
        require!(env::predecessor_account_id() == owner, ERR_NOT_SHARE_OWNER);
        let lot = self.lot(&lot_id);
        let share = lot
            .share(&share_id)
            .unwrap_or_else(|| env::panic_str(ERR_SHARE_NOT_FOUND));
        require!(!share.claimed, ERR_SHARE_CLAIMED);
        let amount = share_entitlement(lot.holder_pool, share.kg, lot.sold_kg);
        self.start_claim(lot_id, ClaimKind::Holder, owner, amount, Some(share_id))
    }

    /// Owner or treasury pulls `claims.treasury`; it always pays the configured treasury.
    pub fn claim_fee(&mut self, lot_id: TokenId) -> Promise {
        let caller = env::predecessor_account_id();
        require!(
            caller == self.owner_id || caller == self.treasury,
            ERR_NOT_FEE_CLAIMER
        );
        let amount = self.lot(&lot_id).claims.get(ClaimKind::Treasury);
        let treasury = self.treasury.clone();
        self.start_claim(lot_id, ClaimKind::Treasury, treasury, amount, None)
    }

    /// Resolves a claim's `ft_transfer`. Must not panic: a panic here would leave the lot
    /// locked forever and the claim zeroed even though the tokens never left.
    #[private]
    pub fn on_claim_resolved(
        &mut self,
        lot_id: TokenId,
        share_id: Option<TokenId>,
        kind: ClaimKind,
        to: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        let ok = result.is_ok();
        let Some(lot) = self.lots.get_mut(&lot_id) else {
            env::log_str(ERR_LOT_NOT_FOUND);
            return false;
        };
        lot.claim_lock = false;
        if ok {
            lot.escrow = lot.escrow.saturating_sub(amount.0);
            if kind == ClaimKind::Farmer {
                self.counters.farmer_paid = self.counters.farmer_paid.saturating_add(amount.0);
            }
        } else {
            let restored = lot.claims.get(kind).saturating_add(amount.0);
            lot.claims.set(kind, restored);
            if let Some(share_id) = &share_id
                && let Some(share) = lot.share_mut(share_id)
            {
                share.claimed = false;
            }
        }
        PratalaEvent::PayoutClaimed(vec![PayoutClaimed {
            lot_id,
            share_id,
            kind,
            to,
            amount,
            ok,
        }])
        .emit();
        ok
    }
}

impl Contract {
    pub(crate) fn share_owner(&self, share_id: &TokenId) -> AccountId {
        self.tokens
            .owner_by_id
            .get(share_id)
            .unwrap_or_else(|| env::panic_str(ERR_SHARE_NOT_FOUND))
    }

    fn start_claim(
        &mut self,
        lot_id: TokenId,
        kind: ClaimKind,
        to: AccountId,
        amount: u128,
        share_id: Option<TokenId>,
    ) -> Promise {
        require!(env::prepaid_gas() >= MIN_GAS_FOR_CLAIM, ERR_NOT_ENOUGH_GAS);
        let mut lot = self.lot(&lot_id);
        require!(
            matches!(lot.status, Status::Settled | Status::Refunded),
            ERR_BAD_STATUS
        );
        require!(!lot.claim_lock, ERR_CLAIM_LOCKED);
        require!(amount > 0, ERR_NOTHING_TO_CLAIM);
        if let Some(share_id) = &share_id {
            let share = lot
                .share_mut(share_id)
                .unwrap_or_else(|| env::panic_str(ERR_SHARE_NOT_FOUND));
            require!(!share.claimed, ERR_SHARE_CLAIMED);
            share.claimed = true;
        }
        let remaining = lot
            .claims
            .get(kind)
            .checked_sub(amount)
            .unwrap_or_else(|| env::panic_str(ERR_OVERFLOW));
        lot.claims.set(kind, remaining);
        lot.claim_lock = true;
        self.save_lot(lot);

        let memo = format!("pratala:{lot_id}:{}", kind_label(kind));
        ext_ft_core::ext(self.usdc_contract.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(to.clone(), U128(amount), Some(memo))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_ON_CLAIM)
                    .on_claim_resolved(lot_id, share_id, kind, to, U128(amount)),
            )
    }
}

fn kind_label(kind: ClaimKind) -> &'static str {
    match kind {
        ClaimKind::Farmer => "farmer",
        ClaimKind::Holder => "holder",
        ClaimKind::Treasury => "treasury",
    }
}

/// NEP-177 metadata for a share NFT. Kept short: the contract pays its storage out of the
/// registration reserve. `extra` carries the purchase terms (U128-as-string convention).
fn share_metadata(lot_id: &TokenId, kg: u64, crop: &str, price_per_kg: u128) -> TokenMetadata {
    TokenMetadata {
        title: Some(format!("{kg} kg of {crop} · {lot_id}")),
        description: Some(format!("Pratala share: {kg} kg of harvest lot {lot_id}.")),
        media: None,
        media_hash: None,
        copies: Some(1),
        issued_at: None,
        expires_at: None,
        starts_at: None,
        updated_at: None,
        extra: Some(
            serde_json::json!({
                "lot_id": lot_id,
                "kg": kg,
                "price_per_kg": price_per_kg.to_string(),
            })
            .to_string(),
        ),
        reference: None,
        reference_hash: None,
    }
}
