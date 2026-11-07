//! Escrow: funding through NEP-141 `ft_transfer_call`, settlement math, and pull-model claims.
//!
//! Claim safety (reentrancy / callback rules from the near-smart-contracts skill):
//! 1. All checks, then state is written *before* the `ft_transfer` promise: the claim is zeroed
//!    and `claim_lock` set, so a second claim or an NFT transfer cannot race the payout.
//! 2. `on_claim_resolved` is `#[private]`, reads the result with `#[callback_result]`, never
//!    panics, always clears the lock, and restores the claim if the transfer failed.

use near_contract_standards::fungible_token::core::ext_ft_core;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::non_fungible_token::TokenId;
use near_sdk::json_types::U128;
use near_sdk::{
    AccountId, Gas, NearToken, Promise, PromiseError, PromiseOrValue, env, near, require,
    serde_json,
};

use crate::errors::*;
use crate::events::{LotFunded, PayoutClaimed, PratalaEvent};
use crate::types::{ClaimKind, Settlement, Status, TransferMsg};
use crate::validate;
use crate::{Contract, ContractExt};

pub const BPS_DENOMINATOR: u128 = 10_000;
pub const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(15);
pub const GAS_FOR_ON_CLAIM: Gas = Gas::from_tgas(10);
/// Transfer + callback + the claim call's own execution.
pub const MIN_GAS_FOR_CLAIM: Gas = Gas::from_tgas(40);

/// Settlement formula from `docs/INTERFACES.md`:
/// `delivered = min(actual, projected)`, `gross = delivered × price`,
/// `fee = floor(gross × fee_bps / 10_000)`, `farmer = gross − fee`, `holder = escrow − gross`.
/// Over-delivery is capped at the projection: the buyer only paid for `projected_kg`.
/// Flooring the fee rounds in the farmer's favour; the three parts always sum to `escrow`.
pub fn compute_settlement(
    projected_kg: u64,
    actual_kg: u64,
    price_per_kg: u128,
    escrow: u128,
    fee_bps: u16,
) -> Settlement {
    let delivered_kg = actual_kg.min(projected_kg);
    let gross = validate::funding_total(delivered_kg, price_per_kg);
    let fee = gross
        .checked_mul(fee_bps as u128)
        .unwrap_or_else(|| env::panic_str(ERR_OVERFLOW))
        / BPS_DENOMINATOR;
    let farmer = gross - fee;
    let holder = escrow
        .checked_sub(gross)
        .unwrap_or_else(|| env::panic_str(ERR_OVERFLOW));
    Settlement {
        delivered_kg,
        gross,
        farmer,
        treasury: fee,
        holder,
    }
}

#[near]
impl FungibleTokenReceiver for Contract {
    /// Funds a Listed lot. Any panic here makes the FT contract refund the whole `amount` to
    /// `sender_id`; on success the unused excess is returned for refund.
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
        let TransferMsg::Fund { lot_id } =
            serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str(ERR_BAD_MSG));

        let mut lot = self.lot(&lot_id);
        require!(lot.status == Status::Listed, ERR_BAD_STATUS);
        require!(sender_id != lot.farmer_id, ERR_FUNDER_IS_FARMER);
        let total = validate::funding_total(lot.projected_kg, lot.price_per_kg);
        require!(total > 0 && amount.0 >= total, ERR_UNDERFUNDED);

        lot.escrow = total;
        lot.funder = Some(sender_id.clone());
        lot.funded_at_ms = Some(env::block_timestamp_ms());
        lot.fee_bps = self.fee_bps;
        lot.status = Status::Funded;
        let farmer_id = lot.farmer_id.clone();
        self.save_lot(lot);
        self.counters.funded_lots += 1;

        // The standard's internal_transfer clears approvals and emits the nep171 nft_transfer
        // event (verified in near-contract-standards 5.30.1 core_impl.rs). Transfers are blocked
        // before funding, so the owner here is always the farmer.
        self.tokens.internal_transfer(
            &farmer_id,
            &sender_id,
            &lot_id,
            None,
            Some(format!("pratala:{lot_id}:funded")),
        );

        let refund = amount.0 - total;
        PratalaEvent::LotFunded(vec![LotFunded {
            lot_id,
            funder: sender_id,
            amount: U128(total),
            refund: U128(refund),
        }])
        .emit();
        PromiseOrValue::Value(U128(refund))
    }
}

#[near]
impl Contract {
    /// Farmer pulls `claims.farmer` after weigh-in.
    pub fn claim_payout(&mut self, lot_id: TokenId) -> Promise {
        let lot = self.lot(&lot_id);
        self.assert_farmer(&lot);
        self.start_claim(lot_id, ClaimKind::Farmer, lot.farmer_id)
    }

    /// Whoever owns the NFT *now* pulls `claims.holder` (under-delivery or crop failure).
    pub fn claim_refund(&mut self, lot_id: TokenId) -> Promise {
        let holder = self.holder_of(&lot_id);
        require!(env::predecessor_account_id() == holder, ERR_NOT_HOLDER);
        self.start_claim(lot_id, ClaimKind::Holder, holder)
    }

    /// Owner or treasury pulls `claims.treasury`; it always pays the configured treasury.
    pub fn claim_fee(&mut self, lot_id: TokenId) -> Promise {
        let caller = env::predecessor_account_id();
        require!(
            caller == self.owner_id || caller == self.treasury,
            ERR_NOT_FEE_CLAIMER
        );
        let treasury = self.treasury.clone();
        self.start_claim(lot_id, ClaimKind::Treasury, treasury)
    }

    /// Resolves a claim's `ft_transfer`. Must not panic: a panic here would leave the lot
    /// locked forever and the claim zeroed even though the tokens never left.
    #[private]
    pub fn on_claim_resolved(
        &mut self,
        lot_id: TokenId,
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
        }
        PratalaEvent::PayoutClaimed(vec![PayoutClaimed {
            lot_id,
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
    pub(crate) fn holder_of(&self, lot_id: &TokenId) -> AccountId {
        self.tokens
            .owner_by_id
            .get(lot_id)
            .unwrap_or_else(|| env::panic_str(ERR_LOT_NOT_FOUND))
    }

    fn start_claim(&mut self, lot_id: TokenId, kind: ClaimKind, to: AccountId) -> Promise {
        require!(env::prepaid_gas() >= MIN_GAS_FOR_CLAIM, ERR_NOT_ENOUGH_GAS);
        let mut lot = self.lot(&lot_id);
        require!(
            matches!(lot.status, Status::Settled | Status::Refunded),
            ERR_BAD_STATUS
        );
        require!(!lot.claim_lock, ERR_CLAIM_LOCKED);
        let amount = lot.claims.get(kind);
        require!(amount > 0, ERR_NOTHING_TO_CLAIM);

        lot.claims.set(kind, 0);
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
                    .on_claim_resolved(lot_id, kind, to, U128(amount)),
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
