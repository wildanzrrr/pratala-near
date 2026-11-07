//! Pratala Test USDC (pUSDC): a NEP-141 + NEP-145 test stablecoin.
//!
//! Forked from `near-examples/FT` and moved onto near-sdk 5.30.1. Adds a capped public
//! `faucet` so demo users can fund lots on testnet, and an owner-only `mint` for seeding.
//! This token has no value; it exists so the `harvest-lot` escrow can be exercised end to end.

use near_contract_standards::fungible_token::events::FtMint;
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::collections::LazyOption;
use near_sdk::json_types::U128;
use near_sdk::{
    AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue, env, log, near, require,
};

#[cfg(test)]
mod test;

/// Largest amount a single `faucet` call may mint: 10,000 pUSDC at 6 decimals.
pub const FAUCET_MAX: u128 = 10_000_000_000;

pub const ERR_NOT_OWNER: &str = "pusdc: only the owner can mint";
pub const ERR_NOT_REGISTERED: &str = "pusdc: caller is not registered, call storage_deposit first";
pub const ERR_FAUCET_CAP: &str = "pusdc: faucet amount exceeds 10000 pUSDC";
pub const ERR_ZERO_AMOUNT: &str = "pusdc: amount must be greater than zero";

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
    owner_id: AccountId,
}

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    FungibleToken,
    Metadata,
}

#[near]
impl Contract {
    /// Initializes the token and credits `total_supply` to `owner_id`.
    #[init]
    pub fn new(owner_id: AccountId, total_supply: U128, metadata: FungibleTokenMetadata) -> Self {
        metadata.assert_valid();
        let mut this = Self {
            token: FungibleToken::new(StorageKey::FungibleToken),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            owner_id: owner_id.clone(),
        };
        this.token.internal_register_account(&owner_id);
        if total_supply.0 > 0 {
            this.token.internal_deposit(&owner_id, total_supply.0);
            FtMint {
                owner_id: &owner_id,
                amount: total_supply,
                memo: Some("initial supply"),
            }
            .emit();
        }
        this
    }

    /// Mints up to 10,000 pUSDC to the caller. The caller must already be storage-registered,
    /// so a wallet batches `storage_deposit` + `faucet` in one transaction.
    pub fn faucet(&mut self, amount: U128) -> U128 {
        require!(amount.0 > 0, ERR_ZERO_AMOUNT);
        require!(amount.0 <= FAUCET_MAX, ERR_FAUCET_CAP);
        let account_id = env::predecessor_account_id();
        self.internal_mint(&account_id, amount, "faucet")
    }

    /// Owner-only mint to a registered account (used by seed scripts and tests).
    pub fn mint(&mut self, account_id: AccountId, amount: U128) -> U128 {
        require!(
            env::predecessor_account_id() == self.owner_id,
            ERR_NOT_OWNER
        );
        require!(amount.0 > 0, ERR_ZERO_AMOUNT);
        self.internal_mint(&account_id, amount, "owner mint")
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner_id.clone()
    }
}

impl Contract {
    /// Credits `amount` to a registered account, emits `ft_mint`, returns the new balance.
    fn internal_mint(&mut self, account_id: &AccountId, amount: U128, memo: &str) -> U128 {
        require!(
            self.token.accounts.contains_key(account_id),
            ERR_NOT_REGISTERED
        );
        self.token.internal_deposit(account_id, amount.0);
        FtMint {
            owner_id: account_id,
            amount,
            memo: Some(memo),
        }
        .emit();
        self.token.ft_balance_of(account_id.clone())
    }
}

#[near]
impl FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Contract {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used_amount, burned_amount) =
            self.token
                .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        if burned_amount > 0 {
            log!("Account @{} burned {}", sender_id, burned_amount);
        }
        used_amount.into()
    }
}

#[near]
impl StorageManagement for Contract {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        if let Some((account_id, balance)) = self.token.internal_storage_unregister(force) {
            log!("Closed @{} with {}", account_id, balance);
            true
        } else {
            false
        }
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Contract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.get().expect("metadata is set at init")
    }
}
