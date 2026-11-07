//! ABI-visible types. JSON shapes match `docs/INTERFACES.md` §3.

use near_contract_standards::non_fungible_token::TokenId;
use near_sdk::json_types::U128;
use near_sdk::{AccountId, near};

/// Lifecycle: Registered → FieldVerified → CoopVerified ⇄ Listed → Funded → Settled | Refunded.
/// Cancelled is reachable from any pre-listing state.
#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Registered,
    FieldVerified,
    CoopVerified,
    Listed,
    Funded,
    Settled,
    Refunded,
    Cancelled,
}

/// `Admin` is the contract owner and is never stored; the other roles are allowlists.
#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    Admin,
    FieldAgent,
    Coop,
    Warehouse,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AttestationKind {
    FieldVisit,
    CoopReview,
    WarehouseWeighIn,
    CropFailure,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClaimKind {
    Farmer,
    Holder,
    Treasury,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Attestation {
    pub kind: AttestationKind,
    pub signer: AccountId,
    pub timestamp_ms: u64,
    pub evidence_hash: String,
    pub evidence_uri: Option<String>,
    pub ai_check_hash: Option<String>,
    pub note: Option<String>,
    pub actual_kg: Option<u64>,
    pub grade: Option<String>,
    pub gps_hash: Option<String>,
}

/// Remaining unclaimed amounts. `farmer + holder + treasury == escrow` at all times after
/// settlement, except while a claim is in flight (`claim_lock`), when the in-flight amount is
/// held by the pending `ft_transfer` and restored on failure.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Claims {
    pub farmer: U128,
    pub holder: U128,
    pub treasury: U128,
}

impl Claims {
    pub fn get(&self, kind: ClaimKind) -> u128 {
        match kind {
            ClaimKind::Farmer => self.farmer.0,
            ClaimKind::Holder => self.holder.0,
            ClaimKind::Treasury => self.treasury.0,
        }
    }

    pub fn set(&mut self, kind: ClaimKind, amount: u128) {
        let slot = match kind {
            ClaimKind::Farmer => &mut self.farmer,
            ClaimKind::Holder => &mut self.holder,
            ClaimKind::Treasury => &mut self.treasury,
        };
        *slot = U128(amount);
    }
}

/// Stored lot. The NFT `token_id` equals `lot_id`; the current holder lives in the NFT
/// `owner_by_id` map, never here, so it cannot go stale.
#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Lot {
    pub lot_id: TokenId,
    pub farmer_id: AccountId,
    pub crop: String,
    pub variety: Option<String>,
    pub region: String,
    pub projected_kg: u64,
    pub harvest_month: String,
    pub plot_hash: String,
    pub gps_hash: String,
    pub area_m2: Option<u64>,
    pub price_per_kg: u128,
    pub status: Status,
    pub attestations: Vec<Attestation>,
    pub escrow: u128,
    pub funder: Option<AccountId>,
    pub funded_at_ms: Option<u64>,
    /// Fee rate frozen at funding, so a later `set_fee_bps` cannot change a funded deal.
    pub fee_bps: u16,
    pub actual_kg: Option<u64>,
    pub grade: Option<String>,
    pub settled_at_ms: Option<u64>,
    pub claims: Claims,
    pub claim_lock: bool,
    pub created_at_ms: u64,
}

impl Lot {
    pub fn last_signer(&self, kind: AttestationKind) -> Option<&AccountId> {
        self.attestations
            .iter()
            .rev()
            .find(|a| a.kind == kind)
            .map(|a| &a.signer)
    }
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LotView {
    pub lot_id: TokenId,
    pub farmer_id: AccountId,
    pub crop: String,
    pub variety: Option<String>,
    pub region: String,
    pub projected_kg: u64,
    pub harvest_month: String,
    pub plot_hash: String,
    pub gps_hash: String,
    pub area_m2: Option<u64>,
    pub price_per_kg: U128,
    pub status: Status,
    pub attestations: Vec<Attestation>,
    pub escrow: U128,
    pub funder: Option<AccountId>,
    pub funded_at_ms: Option<u64>,
    pub fee_bps: u16,
    pub actual_kg: Option<u64>,
    pub grade: Option<String>,
    pub settled_at_ms: Option<u64>,
    pub claims: Claims,
    pub claim_lock: bool,
    pub created_at_ms: u64,
    pub holder: AccountId,
    pub funding_total: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Config {
    pub owner_id: AccountId,
    pub usdc_contract: AccountId,
    pub treasury: AccountId,
    pub fee_bps: u16,
    pub paused: bool,
    pub total_lots: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Stats {
    pub total_lots: u64,
    pub verified_lots: u64,
    pub funded_lots: u64,
    pub settled_lots: u64,
    pub settled_volume: U128,
    pub farmer_paid: U128,
}

/// Running counters behind `get_stats`, updated in place so the view is O(1).
#[near(serializers = [borsh])]
#[derive(Clone, Debug, Default)]
pub struct Counters {
    pub verified_lots: u64,
    pub funded_lots: u64,
    pub settled_lots: u64,
    pub settled_volume: u128,
    pub farmer_paid: u128,
}

/// `ft_transfer_call` message accepted by `ft_on_transfer`: `{"action":"fund","lot_id":"lot-1"}`.
#[near(serializers = [json])]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TransferMsg {
    Fund { lot_id: TokenId },
}

/// Result of the settlement formula; see `escrow::compute_settlement`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Settlement {
    pub delivered_kg: u64,
    pub gross: u128,
    pub farmer: u128,
    pub treasury: u128,
    pub holder: u128,
}
