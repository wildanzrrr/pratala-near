//! (5) Unauthorized attesters, wrong roles, coop == field signer, owner-only admin, pause;
//! (8) pUSDC faucet cap and unregistered faucet caller.

mod common;

use common::*;
use near_sdk::serde_json::{Value, json};

#[tokio::test]
async fn roles_and_admin_are_enforced() -> anyhow::Result<()> {
    let w = World::new().await?;
    let res = w
        .call(
            &w.farmer,
            &w.lots,
            "register_lot",
            json!({"crop": "Corn", "region": "Lombok", "projected_kg": 500,
                   "harvest_month": "2027-06", "plot_hash": HASH, "gps_hash": HASH}),
            REGISTER_DEPOSIT,
            50,
        )
        .await?;
    let lot_id: String = res.json()?;
    let field_args = json!({"lot_id": lot_id, "evidence_hash": HASH, "gps_hash": HASH});
    let coop_args = json!({"lot_id": lot_id, "evidence_hash": HASH2});

    // Unauthorized / wrong-role attesters.
    for who in [&w.buyer, &w.coop, &w.warehouse, &w.owner] {
        w.call_err(
            who,
            &w.lots,
            "attest_field",
            field_args.clone(),
            "not a FieldAgent",
        )
        .await?;
    }
    w.call_err(
        &w.field,
        &w.lots,
        "attest_coop",
        coop_args.clone(),
        "not a Coop",
    )
    .await?;
    w.call_err(
        &w.coop,
        &w.lots,
        "attest_coop",
        coop_args.clone(),
        "status does not allow",
    )
    .await?;
    w.call_ok(&w.field, &w.lots, "attest_field", field_args.clone())
        .await?;

    // A field agent who is also a Coop still cannot review their own field visit.
    w.call_ok(
        &w.owner,
        &w.lots,
        "add_role",
        json!({"role": "Coop", "account_id": w.field}),
    )
    .await?;
    let roles: Vec<String> = w
        .view(&w.lots, "get_roles", json!({"account_id": w.field}))
        .await?;
    assert_eq!(roles, ["FieldAgent", "Coop"]);
    w.call_err(
        &w.field,
        &w.lots,
        "attest_coop",
        coop_args.clone(),
        "coop reviewer must differ from the field agent",
    )
    .await?;
    w.call_ok(&w.coop, &w.lots, "attest_coop", coop_args)
        .await?;

    // Only the farmer lists; only a Warehouse weighs in.
    let list = json!({"lot_id": lot_id, "price_per_kg": "1000000"});
    w.call_err(
        &w.buyer,
        &w.lots,
        "list_lot",
        list.clone(),
        "only the lot farmer",
    )
    .await?;
    w.call_ok(&w.farmer, &w.lots, "list_lot", list).await?;
    w.call_err(
        &w.coop,
        &w.lots,
        "weigh_in",
        json!({"lot_id": lot_id, "actual_kg": 1, "grade": "A", "evidence_hash": HASH}),
        "not a Warehouse",
    )
    .await?;

    // Owner-only administration.
    w.call_err(
        &w.farmer,
        &w.lots,
        "add_role",
        json!({"role": "Warehouse", "account_id": w.farmer}),
        "only the contract owner",
    )
    .await?;
    w.call_err(
        &w.owner,
        &w.lots,
        "add_role",
        json!({"role": "Admin", "account_id": w.farmer}),
        "Admin is the contract owner",
    )
    .await?;
    w.call_err(
        &w.owner,
        &w.lots,
        "set_fee_bps",
        json!({"fee_bps": 1001}),
        "fee_bps must be <= 1000",
    )
    .await?;
    w.call_err(
        &w.farmer,
        &w.lots,
        "set_paused",
        json!({"paused": true}),
        "only the contract owner",
    )
    .await?;
    let owner_roles: Vec<String> = w
        .view(&w.lots, "get_roles", json!({"account_id": w.owner}))
        .await?;
    assert_eq!(owner_roles, ["Admin"]);

    // Removing a role takes effect immediately.
    w.call_ok(
        &w.owner,
        &w.lots,
        "remove_role",
        json!({"role": "Coop", "account_id": w.field}),
    )
    .await?;
    let coops: Vec<String> = w
        .view(&w.lots, "list_role", json!({"role": "Coop"}))
        .await?;
    assert_eq!(coops, [w.coop.as_str()]);

    // Pause blocks funding (full refund) but the config reflects it.
    w.call_ok(&w.owner, &w.lots, "set_paused", json!({"paused": true}))
        .await?;
    let res = w.fund(&w.buyer, &lot_id, 500).await?;
    assert_failed_with(&res, "contract is paused");
    assert_eq!(w.ft_balance(&w.buyer).await?, BUYER_FUNDS);
    let config: Value = w.view(&w.lots, "get_config", json!({})).await?;
    assert_eq!(config["paused"], true);
    assert_eq!(config["usdc_contract"], w.pusdc.as_str());
    Ok(())
}

#[tokio::test]
async fn faucet_is_capped_and_requires_registration() -> anyhow::Result<()> {
    let w = World::new().await?;

    // investor2 is not storage-registered on pUSDC.
    w.call_err(
        &w.investor2,
        &w.pusdc,
        "faucet",
        json!({"amount": "1000000000"}),
        "caller is not registered",
    )
    .await?;

    w.register_ft(&w.investor2).await?;
    w.call_err(
        &w.investor2,
        &w.pusdc,
        "faucet",
        json!({"amount": "10000000001"}),
        "faucet amount exceeds 10000 pUSDC",
    )
    .await?;
    let res = w
        .call(
            &w.investor2,
            &w.pusdc,
            "faucet",
            json!({"amount": "10000000000"}),
            NO_DEPOSIT,
            30,
        )
        .await?;
    assert!(res.is_success(), "{:?}", res.failures());
    assert_eq!(
        events(&res, "nep141", "ft_mint")[0]["data"][0]["amount"],
        "10000000000"
    );
    assert_eq!(w.ft_balance(&w.investor2).await?, 10_000 * PUSDC);

    // Owner mint is not public.
    w.call_err(
        &w.investor2,
        &w.pusdc,
        "mint",
        json!({"account_id": w.investor2, "amount": "1"}),
        "only the owner can mint",
    )
    .await?;
    Ok(())
}
