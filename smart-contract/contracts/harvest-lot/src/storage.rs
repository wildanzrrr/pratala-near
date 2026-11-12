//! Collection prefixes and lot persistence helpers.

use near_contract_standards::non_fungible_token::TokenId;
use near_sdk::{BorshStorageKey, env, near};

use crate::Contract;
use crate::errors::ERR_LOT_NOT_FOUND;
use crate::types::Lot;

/// Every collection prefix. Append-only: reordering would remap deployed state.
#[derive(BorshStorageKey)]
#[near]
pub enum StorageKey {
    NftOwnerById,
    NftMetadata,
    NftTokenMetadata,
    NftEnumeration,
    NftApproval,
    Lots,
    FieldAgents,
    Coops,
    Warehouses,
}

impl Contract {
    pub(crate) fn lot(&self, lot_id: &TokenId) -> Lot {
        self.lots
            .get(lot_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str(ERR_LOT_NOT_FOUND))
    }

    pub(crate) fn save_lot(&mut self, lot: Lot) {
        self.lots.insert(lot.lot_id.clone(), lot);
    }
}

/// Share NFT ids are `"{lot_id}:{no}"` and lot ids never contain `:`, so the prefix before the
/// first `:` is the lot. Returns `None` for plain lot ids (no separator).
pub(crate) fn share_lot_id(share_id: &TokenId) -> Option<TokenId> {
    share_id
        .split_once(':')
        .map(|(lot_id, _)| lot_id.to_string())
}
