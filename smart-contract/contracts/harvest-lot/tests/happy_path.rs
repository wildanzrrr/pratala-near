//! (1) Full lifecycle with balance assertions, two buyers splitting the harvest pro-rata;
//! (7) excess funding refunded.

mod common;

use common::*;
use near_sdk::serde_json::{Value, json};

#[tokio::test]
async fn two_buyers_split_the_harvest_and_escrow_pro_rata() -> anyhow::Result<()> {
    let w = World::new().await?;
    let lot_id = w.listed_lot().await?;

    let lot = w.lot(&lot_id).await?;
    assert_eq!(lot["status"], "Listed");
    assert_eq!(lot["attestations"].as_array().unwrap().len(), 2);
    // The lot certificate stays with the farmer; funding never moves it.
    assert_eq!(w.nft_owner(&lot_id).await?, w.farmer.as_str());
    let quote: String = w
        .view(&w.lots, "quote_funding", json!({"lot_id": lot_id}))
        .await?;
    assert_eq!(quote, TOTAL.to_string());

    // Purchase 1: buyer takes 700 kg (315 pUSDC); the lot stays Listed.
    let res = w.fund(&w.buyer, &lot_id, 700).await?;
    assert!(res.is_success());
    assert!(res.failures().is_empty(), "{:?}", res.failures());
    let funded = &events(&res, "pratala", "lot_funded")[0]["data"][0];
    assert_eq!(funded["kg"], 700);
    assert_eq!(funded["amount"], (700 * PRICE).to_string());
    assert_eq!(funded["share_id"], "lot-1:1");
    let minted = &events(&res, "nep171", "nft_mint")[0]["data"][0];
    assert_eq!(minted["token_ids"][0], "lot-1:1");
    assert_eq!(minted["owner_id"], w.buyer.as_str());

    let lot = w.lot(&lot_id).await?;
    assert_eq!(lot["status"], "Listed");
    assert_eq!(lot["sold_kg"], 700);
    assert_eq!(lot["remaining_kg"], 300);
    assert_eq!(lot["share_count"], 1);
    assert_eq!(lot["escrow"], (700 * PRICE).to_string());
    assert_eq!(w.nft_owner(&lot_id).await?, w.farmer.as_str());
    assert_eq!(w.nft_owner("lot-1:1").await?, w.buyer.as_str());
    assert_eq!(w.ft_balance(&w.buyer).await?, BUYER_FUNDS - 700 * PRICE);

    // Purchase 2: investor2 takes the last 300 kg → sold out → Funded, funding closed.
    w.register_ft(&w.investor2).await?;
    w.call_ok(
        &w.owner,
        &w.pusdc,
        "mint",
        json!({"account_id": w.investor2, "amount": BUYER_FUNDS.to_string()}),
    )
    .await?;
    let res = w.fund(&w.investor2, &lot_id, 300).await?;
    assert!(res.is_success(), "{:?}", res.failures());
    let closed = &events(&res, "pratala", "lot_funding_closed")[0]["data"][0];
    assert_eq!(closed["sold_kg"], 1000);
    assert_eq!(closed["closed_by"], w.investor2.as_str());

    let lot = w.lot(&lot_id).await?;
    assert_eq!(lot["status"], "Funded");
    assert_eq!(lot["remaining_kg"], 0);
    assert_eq!(lot["share_count"], 2);
    assert_eq!(w.ft_balance(&w.lots).await?, TOTAL);

    // 900 kg delivered at 2 %: farmer 396.90, fee 8.10, holder pool 45.00 (31.50 + 13.50).
    w.weigh_in(&lot_id, 900).await?;
    assert_eq!(
        w.claims(&lot_id).await?,
        (396_900_000, 45_000_000, 8_100_000)
    );
    assert!(w.claim(&w.farmer, "claim_payout", &lot_id).await?);
    assert!(w.claim(&w.treasury, "claim_fee", &lot_id).await?);
    let res = w.claim_share(&w.buyer, "lot-1:1").await?;
    assert!(res.is_success() && res.json::<bool>()?);
    let res = w.claim_share(&w.investor2, "lot-1:2").await?;
    assert!(res.is_success() && res.json::<bool>()?);

    // Every pUSDC accounted for: 396.90 + 8.10 + 31.50 + 13.50 = 450.
    assert_eq!(w.ft_balance(&w.farmer).await?, 396_900_000);
    assert_eq!(w.ft_balance(&w.treasury).await?, 8_100_000);
    assert_eq!(
        w.ft_balance(&w.buyer).await?,
        BUYER_FUNDS - 700 * PRICE + 31_500_000
    );
    assert_eq!(
        w.ft_balance(&w.investor2).await?,
        BUYER_FUNDS - 300 * PRICE + 13_500_000
    );
    assert_eq!(w.ft_balance(&w.lots).await?, 0);

    // Paid shares are marked claimed and cannot repeat.
    let share = w.share("lot-1:1").await?;
    assert_eq!(share["claimed"], true);
    assert_eq!(share["entitlement"], "31500000");
    let res = w.claim_share(&w.buyer, "lot-1:1").await?;
    assert_failed_with(&res, "already claimed");

    let lot = w.lot(&lot_id).await?;
    assert_eq!(lot["status"], "Settled");
    assert_eq!(lot["escrow"], "0");
    assert_eq!(lot["claim_lock"], false);
    let stats: Value = w.view(&w.lots, "get_stats", json!({})).await?;
    assert_eq!(stats["settled_lots"], 1);
    assert_eq!(stats["farmer_paid"], "396900000");
    assert_eq!(stats["settled_volume"], "405000000");
    Ok(())
}

#[tokio::test]
async fn partial_close_settles_the_sold_kg_only() -> anyhow::Result<()> {
    let w = World::new().await?;
    let lot_id = w.listed_lot().await?;
    assert!(w.fund(&w.buyer, &lot_id, 700).await?.failures().is_empty());
    assert_eq!(w.lot(&lot_id).await?["status"], "Listed");

    w.call_ok(
        &w.farmer,
        &w.lots,
        "close_funding",
        json!({"lot_id": lot_id}),
    )
    .await?;
    assert_eq!(w.lot(&lot_id).await?["status"], "Funded");
    assert_eq!(w.lot(&lot_id).await?["sold_kg"], 700);

    // 900 kg delivered, but only 700 kg are escrowed: gross caps at the sold kg, no refund.
    w.weigh_in(&lot_id, 900).await?;
    assert_eq!(
        w.claims(&lot_id).await?,
        (700 * PRICE - 6_300_000, 0, 6_300_000) // 308.70 / 0 / 6.30
    );
    assert!(w.claim(&w.farmer, "claim_payout", &lot_id).await?);
    assert!(w.claim(&w.treasury, "claim_fee", &lot_id).await?);
    assert_eq!(w.ft_balance(&w.lots).await?, 0);
    Ok(())
}

#[tokio::test]
async fn excess_funding_is_refunded() -> anyhow::Result<()> {
    let w = World::new().await?;
    let lot_id = w.listed_lot().await?;

    let cost = 300 * PRICE;
    let res = w.fund_kg(&w.buyer, &lot_id, 300, cost + 50 * PUSDC).await?;
    assert!(res.is_success());
    let funded = events(&res, "pratala", "lot_funded");
    assert_eq!(funded[0]["data"][0]["refund"], (50 * PUSDC).to_string());
    let used: String = res.json()?;
    assert_eq!(
        used,
        cost.to_string(),
        "ft_transfer_call returns the used amount"
    );

    assert_eq!(w.ft_balance(&w.buyer).await?, BUYER_FUNDS - cost);
    assert_eq!(w.ft_balance(&w.lots).await?, cost);
    assert_eq!(w.lot(&lot_id).await?["escrow"], cost.to_string());
    assert_eq!(w.lot(&lot_id).await?["sold_kg"], 300);
    Ok(())
}
