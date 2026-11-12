//! NEP-171 core (+ NEP-177 metadata, NEP-178 approvals, NEP-181 enumeration).
//!
//! Everything delegates to `NonFungibleToken` except that both transfer entry points first call
//! `assert_transferable`. Approved-account transfers go through the same two entry points, so
//! a marketplace approval cannot bypass the guard either.

use std::collections::HashMap;

use near_contract_standards::non_fungible_token::approval::NonFungibleTokenApproval;
use near_contract_standards::non_fungible_token::core::{
    NonFungibleTokenCore, NonFungibleTokenResolver,
};
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider,
};
use near_contract_standards::non_fungible_token::{Token, TokenId};
use near_sdk::json_types::U128;
use near_sdk::{AccountId, Promise, PromiseOrValue, env, near, require};

use crate::errors::{ERR_LOT_NOT_FOUND, ERR_NOT_TRANSFERABLE_LOCKED, ERR_NOT_TRANSFERABLE_STATUS};
use crate::storage::share_lot_id;
use crate::types::Status;
use crate::{Contract, ContractExt};

impl Contract {
    /// A lot NFT may move only when the lot carries a funded position (Funded / Settled /
    /// Refunded) and no payout is in flight; before funding it stays with the farmer. A share
    /// NFT (`"{lot_id}:{no}"`) carries escrow-backed claims from the moment it is minted, so it
    /// moves freely except while a payout for its lot is in flight.
    pub(crate) fn assert_transferable(&self, token_id: &TokenId) {
        if let Some(lot_id) = share_lot_id(token_id) {
            let lot = self
                .lots
                .get(&lot_id)
                .unwrap_or_else(|| env::panic_str(ERR_LOT_NOT_FOUND));
            require!(!lot.claim_lock, ERR_NOT_TRANSFERABLE_LOCKED);
            return;
        }
        let lot = self
            .lots
            .get(token_id)
            .unwrap_or_else(|| env::panic_str(ERR_LOT_NOT_FOUND));
        require!(!lot.claim_lock, ERR_NOT_TRANSFERABLE_LOCKED);
        require!(
            matches!(
                lot.status,
                Status::Funded | Status::Settled | Status::Refunded
            ),
            ERR_NOT_TRANSFERABLE_STATUS
        );
    }
}

#[near]
impl NonFungibleTokenCore for Contract {
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        self.assert_transferable(&token_id);
        self.tokens
            .nft_transfer(receiver_id, token_id, approval_id, memo);
    }

    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        self.assert_transferable(&token_id);
        self.tokens
            .nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id)
    }
}

#[near]
impl NonFungibleTokenResolver for Contract {
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        self.tokens.nft_resolve_transfer(
            previous_owner_id,
            receiver_id,
            token_id,
            approved_account_ids,
        )
    }
}

#[near]
impl NonFungibleTokenApproval for Contract {
    #[payable]
    fn nft_approve(
        &mut self,
        token_id: TokenId,
        account_id: AccountId,
        msg: Option<String>,
    ) -> Option<Promise> {
        self.tokens.nft_approve(token_id, account_id, msg)
    }

    #[payable]
    fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        self.tokens.nft_revoke(token_id, account_id);
    }

    #[payable]
    fn nft_revoke_all(&mut self, token_id: TokenId) {
        self.tokens.nft_revoke_all(token_id);
    }

    fn nft_is_approved(
        &self,
        token_id: TokenId,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool {
        self.tokens
            .nft_is_approved(token_id, approved_account_id, approval_id)
    }
}

#[near]
impl NonFungibleTokenEnumeration for Contract {
    fn nft_total_supply(&self) -> U128 {
        self.tokens.nft_total_supply()
    }

    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens(from_index, limit)
    }

    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens.nft_supply_for_owner(account_id)
    }

    fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.tokens
            .nft_tokens_for_owner(account_id, from_index, limit)
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.get().expect("metadata is set at init")
    }
}
