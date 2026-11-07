//! Pratala harvest lot: one NEP-171 NFT per verified harvest projection, holding NEP-141 escrow.
//!
//! Flow: a farmer registers a lot (NFT minted to the farmer) → a FieldAgent and a different
//! Coop attest it → the farmer lists it at a price per kg → a buyer funds it with pUSDC via
//! `ft_transfer_call` (NFT moves farmer → buyer) → a Warehouse weigh-in settles the escrow
//! into farmer / treasury / holder claims, or a Coop declares crop failure and the whole
//! escrow becomes the holder's claim. Claims are pulled; the holder claim always pays the
//! account that owns the NFT at claim time.
//!
//! See `docs/CONTRACTS.md` and `docs/NFT-CONTROL.md` at the repository root.

use near_contract_standards::non_fungible_token::metadata::{
    NFT_METADATA_SPEC, NFTContractMetadata,
};
use near_contract_standards::non_fungible_token::{NonFungibleToken, TokenId};
use near_sdk::collections::LazyOption;
use near_sdk::store::{IterableMap, IterableSet};
use near_sdk::{AccountId, PanicOnDefault, env, near, require};

mod errors;
mod escrow;
mod events;
mod lifecycle;
mod nft;
mod roles;
mod storage;
mod types;
mod validate;
mod views;

#[cfg(test)]
mod test;

pub use crate::errors::*;
// pub use crate::escrow::compute_settlement;
use crate::storage::StorageKey;
pub use crate::types::*;

/// Maximum fee: 10 % (1000 basis points).
pub const MAX_FEE_BPS: u16 = 1_000;
/// Hard cap on attestations per lot; the state machine itself allows at most three.
pub const MAX_ATTESTATIONS: usize = 8;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pub(crate) owner_id: AccountId,
    pub(crate) usdc_contract: AccountId,
    pub(crate) treasury: AccountId,
    pub(crate) fee_bps: u16,
    pub(crate) paused: bool,
    pub(crate) tokens: NonFungibleToken,
    pub(crate) metadata: LazyOption<NFTContractMetadata>,
    pub(crate) lots: IterableMap<TokenId, Lot>,
    pub(crate) next_lot_id: u64,
    pub(crate) field_agents: IterableSet<AccountId>,
    pub(crate) coops: IterableSet<AccountId>,
    pub(crate) warehouses: IterableSet<AccountId>,
    pub(crate) counters: Counters,
}

#[near]
impl Contract {
    /// `usdc_contract` is the only NEP-141 accepted by `ft_on_transfer`.
    #[init]
    pub fn new(
        owner_id: AccountId,
        usdc_contract: AccountId,
        treasury: AccountId,
        fee_bps: u16,
    ) -> Self {
        require!(fee_bps <= MAX_FEE_BPS, ERR_FEE_TOO_HIGH);
        let metadata = NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Pratala Harvest Lots".to_string(),
            symbol: "PRATALA".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        };
        metadata.assert_valid();
        Self {
            owner_id,
            usdc_contract,
            treasury,
            fee_bps,
            paused: false,
            // The standard's own `owner_id` gates its deprecated public `mint`; pointing it at
            // the contract itself means only `register_lot` can mint.
            tokens: NonFungibleToken::new(
                StorageKey::NftOwnerById,
                env::current_account_id(),
                Some(StorageKey::NftTokenMetadata),
                Some(StorageKey::NftEnumeration),
                Some(StorageKey::NftApproval),
            ),
            metadata: LazyOption::new(StorageKey::NftMetadata, Some(&metadata)),
            lots: IterableMap::new(StorageKey::Lots),
            next_lot_id: 1,
            field_agents: IterableSet::new(StorageKey::FieldAgents),
            coops: IterableSet::new(StorageKey::Coops),
            warehouses: IterableSet::new(StorageKey::Warehouses),
            counters: Counters::default(),
        }
    }
}
