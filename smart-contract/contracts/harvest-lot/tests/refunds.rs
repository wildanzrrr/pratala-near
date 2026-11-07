//! (2) Under-delivery split; (3) crop failure refund; (6) double / under / malformed funding
//! is refunded in full by the FT contract.

mod common;

use common::*;
use near_sdk::serde_json::json;

#[tokio::test]
async fn under_delivery_splits_396_90_8_10_45_00() -> anyhow::Result<()> {
    let w = World::new().await?;
    let lot_id = w.funded_lot().await?;

    let res = w
        .call(
            &w.warehouse,
            &w.lots,
            "weigh_in",
            json!({"lot_id": lot_id, "actual_kg": 900, "grade": "B", "evidence_hash": HASH2}),
            NO_DEPOSIT,
            30,
        )
        .await?;
    assert!(res.is_success(), "{:?}", res.failures());
    let settled = &events(&res, "pratala", "lot_settled")[0]["data"][0];
    assert_eq!(settled["farmer_claim"], "396900000");
    assert_eq!(settled["fee"], "8100000");
    assert_eq!(settled["holder_claim"], "45000000");
    assert_eq!(settled["actual_kg"], 900);

    assert_eq!(
        w.claims(&lot_id).await?,
        (396_900_000, 45_000_000, 8_100_000)
    );
    assert!(w.claim(&w.farmer, "claim_payout", &lot_id).await?);
    assert!(w.claim(&w.buyer, "claim_refund", &lot_id).await?);
    assert!(w.claim(&w.owner, "claim_fee", &lot_id).await?); // owner may trigger; pays treasury

    assert_eq!(w.ft_balance(&w.farmer).await?, 396_900_000); // 396.90 pUSDC
    assert_eq!(w.ft_balance(&w.treasury).await?, 8_100_000); // 8.10 pUSDC
    assert_eq!(
        w.ft_balance(&w.buyer).await?,
        BUYER_FUNDS - TOTAL + 45_000_000
    ); // +45.00
    assert_eq!(w.ft_balance(&w.lots).await?, 0);
    assert_eq!(w.lot(&lot_id).await?["escrow"], "0");
    Ok(())
}

#[tokio::test]
async fn crop_failure_refunds_whole_escrow_to_holder() -> anyhow::Result<()> {
    let w = World::new().await?;
    let lot_id = w.funded_lot().await?;

    // Only Coop or owner may declare failure.
    w.call_err(
        &w.warehouse,
        &w.lots,
        "declare_failure",
        json!({"lot_id": lot_id, "reason": "Flood", "evidence_hash": HASH}),
        "not a Coop or the owner",
    )
    .await?;
    let res = w
        .call(
            &w.coop,
            &w.lots,
            "declare_failure",
            json!({"lot_id": lot_id, "reason": "Flood destroyed the paddy", "evidence_hash": HASH}),
            NO_DEPOSIT,
            30,
        )
        .await?;
    assert!(res.is_success(), "{:?}", res.failures());
    let refunded = &events(&res, "pratala", "lot_refunded")[0]["data"][0];
    assert_eq!(refunded["holder_claim"], TOTAL.to_string());

    let lot = w.lot(&lot_id).await?;
    assert_eq!(lot["status"], "Refunded");
    assert_eq!(w.claims(&lot_id).await?, (0, TOTAL, 0));

    w.call_err(
        &w.farmer,
        &w.lots,
        "claim_payout",
        json!({"lot_id": lot_id}),
        "nothing to claim",
    )
    .await?;
    w.call_err(
        &w.warehouse,
        &w.lots,
        "weigh_in",
        json!({"lot_id": lot_id, "actual_kg": 900, "grade": "B", "evidence_hash": HASH2}),
        "status does not allow",
    )
    .await?;

    assert!(w.claim(&w.buyer, "claim_refund", &lot_id).await?);
    assert_eq!(w.ft_balance(&w.buyer).await?, BUYER_FUNDS);
    assert_eq!(w.ft_balance(&w.lots).await?, 0);
    Ok(())
}

#[tokio::test]
async fn invalid_funding_is_refunded_in_full() -> anyhow::Result<()> {
    let w = World::new().await?;
    let lot_id = w.listed_lot().await?;

    // Under-amount: ft_on_transfer panics, ft_resolve_transfer returns everything.
    let res = w.fund(&w.buyer, &lot_id, TOTAL - 1).await?;
    assert_failed_with(&res, "amount is below the funding total");
    assert_eq!(res.json::<String>()?, "0", "nothing used");
    assert_eq!(w.ft_balance(&w.buyer).await?, BUYER_FUNDS);
    assert_eq!(w.lot(&lot_id).await?["status"], "Listed");

    // Malformed msg and unknown lot.
    let res = w.fund_msg(&w.buyer, TOTAL, "please fund lot-1").await?;
    assert_failed_with(&res, "msg must be");
    let res = w
        .fund_msg(&w.buyer, TOTAL, r#"{"action":"fund","lot_id":"lot-99"}"#)
        .await?;
    assert_failed_with(&res, "lot not found");
    assert_eq!(w.ft_balance(&w.buyer).await?, BUYER_FUNDS);

    // The farmer cannot buy their own lot.
    w.call_ok(
        &w.owner,
        &w.pusdc,
        "mint",
        json!({"account_id": w.farmer, "amount": TOTAL.to_string()}),
    )
    .await?;
    let res = w.fund(&w.farmer, &lot_id, TOTAL).await?;
    assert_failed_with(&res, "farmer cannot fund their own lot");
    assert_eq!(w.ft_balance(&w.farmer).await?, TOTAL);

    // First funding succeeds; a second one is refunded in full.
    assert!(
        w.fund(&w.buyer, &lot_id, TOTAL)
            .await?
            .failures()
            .is_empty()
    );
    let res = w.fund(&w.buyer, &lot_id, TOTAL).await?;
    assert_failed_with(&res, "status does not allow");
    assert_eq!(w.ft_balance(&w.buyer).await?, BUYER_FUNDS - TOTAL);
    assert_eq!(w.ft_balance(&w.lots).await?, TOTAL);
    assert_eq!(w.lot(&lot_id).await?["escrow"], TOTAL.to_string());
    Ok(())
}
