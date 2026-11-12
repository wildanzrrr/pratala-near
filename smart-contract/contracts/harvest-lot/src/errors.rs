//! Error messages. Stable strings: the frontend and tests match on them.

pub const ERR_NOT_OWNER: &str = "harvest-lot: only the contract owner can call this";
pub const ERR_NOT_FARMER: &str = "harvest-lot: only the lot farmer can call this";
pub const ERR_NOT_FARMER_OR_OWNER: &str = "harvest-lot: only the farmer or the owner can call this";
pub const ERR_NOT_FIELD_AGENT: &str = "harvest-lot: caller is not a FieldAgent";
pub const ERR_NOT_COOP: &str = "harvest-lot: caller is not a Coop";
pub const ERR_NOT_COOP_OR_OWNER: &str = "harvest-lot: caller is not a Coop or the owner";
pub const ERR_NOT_WAREHOUSE: &str = "harvest-lot: caller is not a Warehouse";
pub const ERR_NOT_SHARE_OWNER: &str = "harvest-lot: only the share NFT owner can claim its refund";
pub const ERR_SHARE_CLAIMED: &str = "harvest-lot: this share's refund was already claimed";
pub const ERR_SHARE_NOT_FOUND: &str = "harvest-lot: share not found";
pub const ERR_NOT_FEE_CLAIMER: &str =
    "harvest-lot: only the owner or the treasury can claim the fee";
pub const ERR_SELF_ATTEST: &str = "harvest-lot: the farmer cannot attest their own lot";
pub const ERR_COOP_IS_FIELD_SIGNER: &str =
    "harvest-lot: the coop reviewer must differ from the field agent";
pub const ERR_ADMIN_ROLE: &str = "harvest-lot: Admin is the contract owner and cannot be assigned";

pub const ERR_PAUSED: &str = "harvest-lot: contract is paused";
pub const ERR_LOT_NOT_FOUND: &str = "harvest-lot: lot not found";
pub const ERR_BAD_STATUS: &str = "harvest-lot: lot status does not allow this action";
pub const ERR_TOO_MANY_ATTESTATIONS: &str = "harvest-lot: attestation limit reached";
pub const ERR_FEE_TOO_HIGH: &str = "harvest-lot: fee_bps must be <= 1000";

pub const ERR_STRING_EMPTY: &str = "harvest-lot: required string is empty";
pub const ERR_STRING_TOO_LONG: &str = "harvest-lot: string exceeds 256 bytes";
pub const ERR_BAD_HASH: &str = "harvest-lot: hash must be 64 lowercase hex characters";
pub const ERR_BAD_MONTH: &str = "harvest-lot: harvest_month must be YYYY-MM";
pub const ERR_ZERO_KG: &str = "harvest-lot: projected_kg must be greater than zero";
pub const ERR_ZERO_PRICE: &str = "harvest-lot: price_per_kg must be greater than zero";
pub const ERR_OVERFLOW: &str = "harvest-lot: arithmetic overflow";
pub const ERR_STORAGE_DEPOSIT: &str = "harvest-lot: attached deposit does not cover storage";

pub const ERR_WRONG_TOKEN: &str = "harvest-lot: only the configured pUSDC contract can fund lots";
pub const ERR_BAD_MSG: &str =
    "harvest-lot: msg must be {\"action\":\"fund\",\"lot_id\":\"...\",\"kg\":1}";
pub const ERR_UNDERFUNDED: &str = "harvest-lot: amount is below the cost of the requested kg";
pub const ERR_FUNDER_IS_FARMER: &str = "harvest-lot: the farmer cannot fund their own lot";
pub const ERR_OVER_REMAINING: &str = "harvest-lot: kg exceeds the remaining unsold kg of this lot";
pub const ERR_MAX_SHARES: &str =
    "harvest-lot: share limit reached for this lot; the farmer must close funding";
pub const ERR_NOTHING_SOLD: &str = "harvest-lot: close_funding needs at least one kg sold";
pub const ERR_HAS_SALES: &str =
    "harvest-lot: lot already sold kg; it can no longer be repriced, delisted or cancelled";

pub const ERR_CLAIM_LOCKED: &str = "harvest-lot: a payout for this lot is in flight";
pub const ERR_NOTHING_TO_CLAIM: &str = "harvest-lot: nothing to claim";
pub const ERR_NOT_ENOUGH_GAS: &str = "harvest-lot: attach at least 40 Tgas to claim";

pub const ERR_NOT_TRANSFERABLE_LOCKED: &str =
    "harvest-lot: NFT cannot move while a payout is in flight";
pub const ERR_NOT_TRANSFERABLE_STATUS: &str =
    "harvest-lot: NFT can only move once the lot is funded and not cancelled";
