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
