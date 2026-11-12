//! ABI-visible types. JSON shapes match `docs/INTERFACES.md` §3.

use near_contract_standards::non_fungible_token::TokenId;
use near_sdk::json_types::U128;
use near_sdk::{AccountId, near};

/// Lifecycle: Registered → FieldVerified → CoopVerified ⇄ Listed → Funded → Settled | Refunded.
/// `Listed` means funding is open: buyers may buy any number of the remaining kg. The lot moves
/// to `Funded` when every projected kg is sold, or early via `close_funding` with partial escrow.
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
/// held by the pending `ft_transfer` and restored on failure. `holder` is the sum of the
/// per-share entitlements (rounding dust went to `treasury`); each share claims its own slice.
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

/// One kg-denominated share NFT (`"{lot_id}:{no}"`). The current owner lives in the NEP-171
/// `owner_by_id` map, never here, so it cannot go stale; `claimed` debits the share's one-time
/// refund entitlement after settlement.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Share {
    pub share_id: TokenId,
    pub kg: u64,
    pub claimed: bool,
}

/// Stored lot. The lot NFT `token_id` equals `lot_id`; its kg are sold through `Share` NFTs
/// tracked in `shares`, in mint order.
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
    /// kg already sold to buyers; `projected_kg − sold_kg` stays open while Listed.
    pub sold_kg: u64,
    /// Share NFTs in mint order (≤ `MAX_SHARES_PER_LOT`).
    pub shares: Vec<Share>,
    /// Next share NFT sequence number for this lot.
    pub next_share_no: u64,
    pub escrow: u128,
    pub funded_at_ms: Option<u64>,
    /// Fee rate frozen at the first sale, so a later `set_fee_bps` cannot change a funded deal.
    pub fee_bps: u16,
    /// Refund pool snapshotted at settlement; per-share entitlements are computed against it.
    pub holder_pool: u128,
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

    pub fn remaining_kg(&self) -> u64 {
        self.projected_kg.saturating_sub(self.sold_kg)
    }

    pub fn share(&self, share_id: &TokenId) -> Option<&Share> {
        self.shares.iter().find(|s| &s.share_id == share_id)
    }

    pub fn share_mut(&mut self, share_id: &TokenId) -> Option<&mut Share> {
        self.shares.iter_mut().find(|s| &s.share_id == share_id)
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
    pub sold_kg: u64,
    pub remaining_kg: u64,
    pub share_count: u64,
    pub escrow: U128,
    pub funded_at_ms: Option<u64>,
    pub fee_bps: u16,
    pub actual_kg: Option<u64>,
    pub grade: Option<String>,
    pub settled_at_ms: Option<u64>,
    pub claims: Claims,
    pub claim_lock: bool,
    pub created_at_ms: u64,
    pub funding_total: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShareView {
    pub share_id: TokenId,
    pub lot_id: TokenId,
    pub kg: u64,
    pub owner: AccountId,
    pub claimed: bool,
    /// Refund entitlement once the lot is Settled/Refunded (and unclaimed); `"0"` before.
    pub entitlement: U128,
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

/// `ft_transfer_call` message accepted by `ft_on_transfer`:
/// `{"action":"fund","lot_id":"lot-1","kg":300}` — buy 300 kg of the listed harvest.
#[near(serializers = [json])]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TransferMsg {
    Fund { lot_id: TokenId, kg: u64 },
}

/// Result of the settlement formula; see `escrow::compute_settlement`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Settlement {
    pub delivered_kg: u64,
    pub gross: u128,
    pub farmer: u128,
    /// Fee plus the rounding dust swept from the holder pool.
    pub treasury: u128,
    /// Sum of the per-share floor entitlements.
    pub holder: u128,
    /// Refund pool before the per-share split; each share gets `floor(pool × kg / sold_kg)`.
    pub holder_pool: u128,
    /// Rounding remainder: `holder_pool − holder`, paid to the treasury with the fee.
    pub dust: u128,
}
