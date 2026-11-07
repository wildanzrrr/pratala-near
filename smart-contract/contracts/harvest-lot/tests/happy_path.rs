//! (1) Full lifecycle with balance assertions; (7) excess funding refunded.

mod common;

use common::*;
use near_sdk::serde_json::{Value, json};

#[tokio::test]
async fn full_lifecycle_pays_farmer_and_treasury() -> anyhow::Result<()> {
    let w = World::new().await?;
    let lot_id = w.listed_lot().await?;

    let lot = w.lot(&lot_id).await?;
    assert_eq!(lot["status"], "Listed");
    assert_eq!(lot["attestations"].as_array().unwrap().len(), 2);
    assert_eq!(w.nft_owner(&lot_id).await?, w.farmer.as_str());
    let quote: String = w
        .view(&w.lots, "quote_funding", json!({"lot_id": lot_id}))
        .await?;
    assert_eq!(quote, TOTAL.to_string());

    // Fund: escrow moves buyer -> lots, NFT moves farmer -> buyer.
    let res = w.fund(&w.buyer, &lot_id, TOTAL).await?;
    assert!(res.is_success());
    assert!(res.failures().is_empty(), "{:?}", res.failures());
    let funded = events(&res, "pratala", "lot_funded");
    assert_eq!(funded[0]["data"][0]["amount"], TOTAL.to_string());
    assert_eq!(funded[0]["data"][0]["refund"], "0");
    let moved = events(&res, "nep171", "nft_transfer");
    assert_eq!(moved[0]["data"][0]["old_owner_id"], w.farmer.as_str());
    assert_eq!(moved[0]["data"][0]["new_owner_id"], w.buyer.as_str());

    assert_eq!(w.ft_balance(&w.buyer).await?, BUYER_FUNDS - TOTAL);
    assert_eq!(w.ft_balance(&w.lots).await?, TOTAL);
    assert_eq!(w.nft_owner(&lot_id).await?, w.buyer.as_str());
    let lot = w.lot(&lot_id).await?;
    assert_eq!(lot["status"], "Funded");
    assert_eq!(lot["holder"], w.buyer.as_str());
    assert_eq!(lot["funder"], w.buyer.as_str());
    assert_eq!(lot["escrow"], TOTAL.to_string());

    // Full delivery at 2 %: farmer 441, treasury 9, holder 0.
    w.weigh_in(&lot_id, KG).await?;
    assert_eq!(w.claims(&lot_id).await?, (441 * PUSDC, 0, 9 * PUSDC));
    assert!(w.claim(&w.farmer, "claim_payout", &lot_id).await?);
    assert!(w.claim(&w.treasury, "claim_fee", &lot_id).await?);
    assert_eq!(w.ft_balance(&w.farmer).await?, 441 * PUSDC);
    assert_eq!(w.ft_balance(&w.treasury).await?, 9 * PUSDC);
    assert_eq!(w.ft_balance(&w.lots).await?, 0);

    // Nothing left to pull; claims cannot be repeated.
    w.call_err(
        &w.buyer,
        &w.lots,
        "claim_refund",
        json!({"lot_id": lot_id}),
        "nothing to claim",
    )
    .await?;
    w.call_err(
        &w.farmer,
        &w.lots,
        "claim_payout",
        json!({"lot_id": lot_id}),
        "nothing to claim",
    )
    .await?;

    let lot = w.lot(&lot_id).await?;
    assert_eq!(lot["status"], "Settled");
    assert_eq!(lot["escrow"], "0");
    assert_eq!(lot["claim_lock"], false);
    let stats: Value = w.view(&w.lots, "get_stats", json!({})).await?;
    assert_eq!(stats["settled_lots"], 1);
    assert_eq!(stats["farmer_paid"], (441 * PUSDC).to_string());
    assert_eq!(stats["settled_volume"], TOTAL.to_string());
    Ok(())
}

#[tokio::test]
async fn excess_funding_is_refunded() -> anyhow::Result<()> {
    let w = World::new().await?;
    let lot_id = w.listed_lot().await?;

    let res = w.fund(&w.buyer, &lot_id, TOTAL + 50 * PUSDC).await?;
    assert!(res.is_success());
    let funded = events(&res, "pratala", "lot_funded");
    assert_eq!(funded[0]["data"][0]["refund"], (50 * PUSDC).to_string());
    let used: String = res.json()?;
    assert_eq!(
        used,
        TOTAL.to_string(),
        "ft_transfer_call returns the used amount"
    );

    assert_eq!(w.ft_balance(&w.buyer).await?, BUYER_FUNDS - TOTAL);
    assert_eq!(w.ft_balance(&w.lots).await?, TOTAL);
    assert_eq!(w.lot(&lot_id).await?["escrow"], TOTAL.to_string());
    Ok(())
}
