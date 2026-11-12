//! NEP-297 events under the `pratala` standard, version 1.0.0.
//!
//! Each variant wraps a `Vec` so the log is `"data":[{...}]`, the shape every NEP-297 standard
//! (nep171, nep141) uses and that `docs/INTERFACES.md` §3 specifies.

use near_contract_standards::non_fungible_token::TokenId;
use near_sdk::json_types::U128;
use near_sdk::{AccountId, near};

use crate::types::{AttestationKind, ClaimKind, Role};

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct LotRegistered {
    pub lot_id: TokenId,
    pub farmer_id: AccountId,
    pub crop: String,
    pub projected_kg: u64,
    pub harvest_month: String,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct LotAttested {
    pub lot_id: TokenId,
    pub kind: AttestationKind,
    pub signer: AccountId,
    pub evidence_hash: String,
    pub ai_check_hash: Option<String>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct LotListed {
    pub lot_id: TokenId,
    pub price_per_kg: U128,
    pub total: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct LotRef {
    pub lot_id: TokenId,
}

/// One kg purchase: the buyer paid `amount` for `kg` and holds `share_id` afterwards.
/// `sold_kg` is the cumulative total after this purchase.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct LotFunded {
    pub lot_id: TokenId,
    pub buyer: AccountId,
    pub kg: u64,
    pub amount: U128,
    pub refund: U128,
    pub sold_kg: u64,
    pub share_id: TokenId,
}

/// Funding closed: every projected kg sold, or an early `close_funding` with partial escrow.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct LotFundingClosed {
    pub lot_id: TokenId,
    pub sold_kg: u64,
    pub projected_kg: u64,
    pub closed_by: AccountId,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct LotSettled {
    pub lot_id: TokenId,
    pub actual_kg: u64,
    pub grade: String,
    pub sold_kg: u64,
    pub farmer_claim: U128,
    /// Refund pool split across share NFTs pro-rata by kg (dust went to `fee`).
    pub holder_pool: U128,
    /// Treasury claim: the fee plus the rounding dust.
    pub fee: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct LotRefunded {
    pub lot_id: TokenId,
    pub reason: String,
    /// Refund pool split across share NFTs pro-rata by kg.
    pub holder_pool: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct PayoutClaimed {
    pub lot_id: TokenId,
    /// The share NFT behind a Holder claim; `null` for farmer/treasury claims.
    pub share_id: Option<TokenId>,
    pub kind: ClaimKind,
    pub to: AccountId,
    pub amount: U128,
    pub ok: bool,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct RoleChanged {
    pub role: Role,
    pub account_id: AccountId,
    pub added: bool,
}

#[near(event_json(standard = "pratala"))]
pub enum PratalaEvent {
    #[event_version("1.0.0")]
    LotRegistered(Vec<LotRegistered>),
    #[event_version("1.0.0")]
    LotAttested(Vec<LotAttested>),
    #[event_version("1.0.0")]
    LotListed(Vec<LotListed>),
    #[event_version("1.0.0")]
    LotDelisted(Vec<LotRef>),
    #[event_version("1.0.0")]
    LotCancelled(Vec<LotRef>),
    #[event_version("1.0.0")]
    LotFunded(Vec<LotFunded>),
    #[event_version("1.0.0")]
    LotFundingClosed(Vec<LotFundingClosed>),
    #[event_version("1.0.0")]
    LotSettled(Vec<LotSettled>),
    #[event_version("1.0.0")]
    LotRefunded(Vec<LotRefunded>),
    #[event_version("1.0.0")]
    PayoutClaimed(Vec<PayoutClaimed>),
    #[event_version("1.0.0")]
    RoleChanged(Vec<RoleChanged>),
}
