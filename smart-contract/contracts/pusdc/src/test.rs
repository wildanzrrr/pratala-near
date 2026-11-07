use super::*;
use near_contract_standards::fungible_token::metadata::FT_METADATA_SPEC;
use near_sdk::test_utils::{VMContextBuilder, accounts, get_logs};
use near_sdk::testing_env;

const SUPPLY: u128 = 1_000_000_000_000; // 1,000,000 pUSDC

fn metadata() -> FungibleTokenMetadata {
    FungibleTokenMetadata {
        spec: FT_METADATA_SPEC.to_string(),
        name: "Pratala Test USDC".to_string(),
        symbol: "pUSDC".to_string(),
        icon: None,
        reference: None,
        reference_hash: None,
        decimals: 6,
    }
}

fn setup() -> (Contract, VMContextBuilder) {
    let mut context = VMContextBuilder::new();
    context.current_account_id(accounts(0));
    context.predecessor_account_id(accounts(1));
    testing_env!(context.build());
    let contract = Contract::new(accounts(1), U128(SUPPLY), metadata());
    (contract, context)
}

fn register(contract: &mut Contract, context: &mut VMContextBuilder, who: AccountId) {
    testing_env!(
        context
            .predecessor_account_id(who)
            .attached_deposit(contract.storage_balance_bounds().min)
            .build()
    );
    contract.storage_deposit(None, None);
    testing_env!(
        context
            .attached_deposit(NearToken::from_yoctonear(0))
            .build()
    );
}

#[test]
fn new_mints_supply_to_owner() {
    let (contract, _) = setup();
    assert_eq!(contract.ft_total_supply().0, SUPPLY);
    assert_eq!(contract.ft_balance_of(accounts(1)).0, SUPPLY);
    assert_eq!(contract.ft_metadata().decimals, 6);
    assert_eq!(contract.ft_metadata().symbol, "pUSDC");
    assert_eq!(contract.get_owner(), accounts(1));
}

#[test]
fn faucet_mints_to_registered_caller_and_emits_ft_mint() {
    let (mut contract, mut context) = setup();
    register(&mut contract, &mut context, accounts(2));
    let balance = contract.faucet(U128(FAUCET_MAX));
    assert_eq!(balance.0, FAUCET_MAX);
    assert_eq!(contract.ft_total_supply().0, SUPPLY + FAUCET_MAX);
    let logs = get_logs();
    let last = logs.last().expect("ft_mint log");
    assert!(last.starts_with("EVENT_JSON:"));
    assert!(last.contains("\"event\":\"ft_mint\""));
    assert!(last.contains(&format!("\"amount\":\"{FAUCET_MAX}\"")));
}

#[test]
#[should_panic(expected = "pusdc: faucet amount exceeds 10000 pUSDC")]
fn faucet_rejects_above_cap() {
    let (mut contract, mut context) = setup();
    register(&mut contract, &mut context, accounts(2));
    contract.faucet(U128(FAUCET_MAX + 1));
}

#[test]
#[should_panic(expected = "pusdc: caller is not registered")]
fn faucet_rejects_unregistered_caller() {
    let (mut contract, mut context) = setup();
    testing_env!(context.predecessor_account_id(accounts(3)).build());
    contract.faucet(U128(1_000_000));
}

#[test]
#[should_panic(expected = "pusdc: amount must be greater than zero")]
fn faucet_rejects_zero() {
    let (mut contract, mut context) = setup();
    register(&mut contract, &mut context, accounts(2));
    contract.faucet(U128(0));
}

#[test]
fn owner_can_mint_to_registered_account() {
    let (mut contract, mut context) = setup();
    register(&mut contract, &mut context, accounts(2));
    testing_env!(context.predecessor_account_id(accounts(1)).build());
    let minted = 50_000_000_000; // 50,000 pUSDC: owner mint is not capped
    assert_eq!(contract.mint(accounts(2), U128(minted)).0, minted);
}

#[test]
#[should_panic(expected = "pusdc: only the owner can mint")]
fn non_owner_cannot_mint() {
    let (mut contract, mut context) = setup();
    register(&mut contract, &mut context, accounts(2));
    contract.mint(accounts(2), U128(1));
}

#[test]
#[should_panic(expected = "pusdc: caller is not registered")]
fn owner_mint_requires_registration() {
    let (mut contract, mut context) = setup();
    testing_env!(context.predecessor_account_id(accounts(1)).build());
    contract.mint(accounts(4), U128(1));
}

#[test]
fn transfer_between_registered_accounts() {
    let (mut contract, mut context) = setup();
    register(&mut contract, &mut context, accounts(2));
    testing_env!(
        context
            .predecessor_account_id(accounts(1))
            .attached_deposit(NearToken::from_yoctonear(1))
            .build()
    );
    contract.ft_transfer(accounts(2), U128(450_000_000), None);
    assert_eq!(contract.ft_balance_of(accounts(2)).0, 450_000_000);
    assert_eq!(contract.ft_balance_of(accounts(1)).0, SUPPLY - 450_000_000);
}
