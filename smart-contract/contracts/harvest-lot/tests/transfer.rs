//! (4) NFTs that carry money: selling a funded lot moves the refund right to the new holder,
//! the seller keeps nothing, and the NFT cannot move while a payout is in flight.

mod common;

use common::*;
use near_sdk::serde_json::{Value, json};

#[tokio::test]
async fn refund_follows_the_nft_and_lock_blocks_mid_payout_sale() -> anyhow::Result<()> {
    let w = World::new().await?;
    let lot_id = w.funded_lot().await?;

    // Buyer sells the funded position to investor2 (secondary sale).
    let res = w
        .call(
            &w.buyer,
            &w.lots,
            "nft_transfer",
            json!({"receiver_id": w.investor2, "token_id": lot_id, "memo": "secondary sale"}),
            ONE_YOCTO,
            30,
        )
        .await?;
    assert!(res.is_success(), "{:?}", res.failures());
    assert_eq!(
        events(&res, "nep171", "nft_transfer")[0]["data"][0]["new_owner_id"],
        w.investor2.as_str()
    );
    assert_eq!(w.nft_owner(&lot_id).await?, w.investor2.as_str());
    let held: Vec<Value> = w
        .view(
            &w.lots,
            "get_lots_for_holder",
            json!({"account_id": w.investor2}),
        )
        .await?;
    assert_eq!(held[0]["lot_id"], lot_id.as_str());
    let held: Vec<Value> = w
        .view(
            &w.lots,
            "get_lots_for_holder",
            json!({"account_id": w.buyer}),
        )
        .await?;
    assert!(held.is_empty());

    w.weigh_in(&lot_id, 900).await?;
    assert_eq!(w.claims(&lot_id).await?.1, 45 * PUSDC);

    // The seller lost the refund right with the NFT.
    w.call_err(
        &w.buyer,
        &w.lots,
        "claim_refund",
        json!({"lot_id": lot_id}),
        "only the current NFT holder",
    )
    .await?;

    // investor2 is not registered on pUSDC: ft_transfer fails, the callback restores the
    // claim and clears the lock instead of losing the money.
    let res = w
        .call(
            &w.investor2,
            &w.lots,
            "claim_refund",
            json!({"lot_id": lot_id}),
            NO_DEPOSIT,
            60,
        )
        .await?;
    let claimed = events(&res, "pratala", "payout_claimed")[0]["data"][0].clone();
    assert!(!res.json::<bool>()?, "payout must report failure");
    assert_eq!(claimed["ok"], false);
    assert_eq!(claimed["to"], w.investor2.as_str());
    let lot = w.lot(&lot_id).await?;
    assert_eq!(lot["claim_lock"], false);
    assert_eq!(lot["claims"]["holder"], (45 * PUSDC).to_string());
    assert_eq!(lot["escrow"], TOTAL.to_string());
    assert_eq!(w.ft_balance(&w.lots).await?, TOTAL);

    // Mid-payout lock, observed deterministically: claim_refund and nft_transfer in ONE
    // transaction execute in the same receipt, so the transfer runs after claim_refund has
    // set claim_lock and before the ft_transfer promise resolves. It must be rejected, and
    // the panic reverts the whole receipt (claim included).
    let res = w
        .batch(
            &w.investor2,
            &w.lots,
            vec![
                ("claim_refund", json!({"lot_id": lot_id}), NO_DEPOSIT),
                (
                    "nft_transfer",
                    json!({"receiver_id": w.buyer, "token_id": lot_id}),
                    ONE_YOCTO,
                ),
            ],
        )
        .await?;
    assert_failed_with(&res, "NFT cannot move while a payout is in flight");
    assert_eq!(w.nft_owner(&lot_id).await?, w.investor2.as_str());
    let lot = w.lot(&lot_id).await?;
    assert_eq!(lot["claim_lock"], false);
    assert_eq!(lot["claims"]["holder"], (45 * PUSDC).to_string());

    // After registering, investor2 pulls the restored refund.
    w.register_ft(&w.investor2).await?;
    assert!(w.claim(&w.investor2, "claim_refund", &lot_id).await?);
    assert_eq!(w.ft_balance(&w.investor2).await?, 45 * PUSDC);
    assert!(w.claim(&w.farmer, "claim_payout", &lot_id).await?);
    assert!(w.claim(&w.treasury, "claim_fee", &lot_id).await?);
    assert_eq!(w.ft_balance(&w.lots).await?, 0);

    // A settled, fully paid NFT is still a transferable receipt, but carries no money.
    let res = w
        .call(
            &w.investor2,
            &w.lots,
            "nft_transfer",
            json!({"receiver_id": w.buyer, "token_id": lot_id}),
            ONE_YOCTO,
            30,
        )
        .await?;
    assert!(res.is_success(), "{:?}", res.failures());
    w.call_err(
        &w.buyer,
        &w.lots,
        "claim_refund",
        json!({"lot_id": lot_id}),
        "nothing to claim",
    )
    .await?;
    Ok(())
}

#[tokio::test]
async fn nft_stays_with_farmer_until_funded_and_approvals_are_cleared() -> anyhow::Result<()> {
    let w = World::new().await?;
    let lot_id = w.listed_lot().await?;

    // Before funding the NFT cannot be moved, even by its owner.
    let res = w
        .call(
            &w.farmer,
            &w.lots,
            "nft_transfer",
            json!({"receiver_id": w.investor2, "token_id": lot_id}),
            ONE_YOCTO,
            30,
        )
        .await?;
    assert_failed_with(&res, "only move once the lot is funded");

    // The farmer approves a "marketplace" (coop account) before funding ...
    let res = w
        .call(
            &w.farmer,
            &w.lots,
            "nft_approve",
            json!({"token_id": lot_id, "account_id": w.coop}),
            near_api::NearToken::from_millinear(10),
            30,
        )
        .await?;
    assert!(res.is_success(), "{:?}", res.failures());
    let approved: bool = w
        .view(
            &w.lots,
            "nft_is_approved",
            json!({"token_id": lot_id, "approved_account_id": w.coop}),
        )
        .await?;
    assert!(approved);

    // ... funding moves the NFT and clears that approval, so the seller's delegate cannot
    // pull the buyer's NFT back.
    assert!(
        w.fund(&w.buyer, &lot_id, TOTAL)
            .await?
            .failures()
            .is_empty()
    );
    let approved: bool = w
        .view(
            &w.lots,
            "nft_is_approved",
            json!({"token_id": lot_id, "approved_account_id": w.coop}),
        )
        .await?;
    assert!(!approved);
    let res = w
        .call(
            &w.coop,
            &w.lots,
            "nft_transfer",
            json!({"receiver_id": w.farmer, "token_id": lot_id, "approval_id": 1}),
            ONE_YOCTO,
            30,
        )
        .await?;
    assert_failed_with(&res, "Sender not approved");
    assert_eq!(w.nft_owner(&lot_id).await?, w.buyer.as_str());

    // A cancelled lot's NFT never moves.
    let other = w.listed_lot().await?;
    w.call_ok(&w.farmer, &w.lots, "delist_lot", json!({"lot_id": other}))
        .await?;
    w.call_ok(&w.farmer, &w.lots, "cancel_lot", json!({"lot_id": other}))
        .await?;
    let res = w
        .call(
            &w.farmer,
            &w.lots,
            "nft_transfer",
            json!({"receiver_id": w.buyer, "token_id": other}),
            ONE_YOCTO,
            30,
        )
        .await?;
    assert_failed_with(&res, "only move once the lot is funded");
    Ok(())
}
