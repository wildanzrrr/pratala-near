//! Unit tests (mocked blockchain). Sandbox tests live in `tests/`.

use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;
use near_sdk::json_types::U128;
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::{AccountId, NearToken, PromiseError, PromiseOrValue, serde_json, testing_env};

use crate::*;

const KG: u64 = 1_000;
const PRICE: u128 = 450_000; // 0.45 pUSDC per kg
const TOTAL: u128 = 450_000_000; // 450 pUSDC
const HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HASH2: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

fn acc(name: &str) -> AccountId {
    format!("{name}.near").parse().unwrap()
}

struct T {
    c: Contract,
    ctx: VMContextBuilder,
}

impl T {
    fn new(fee_bps: u16) -> Self {
        let mut ctx = VMContextBuilder::new();
        ctx.current_account_id(acc("lots"))
            .predecessor_account_id(acc("owner"));
        testing_env!(ctx.build());
        let mut c = Contract::new(acc("owner"), acc("pusdc"), acc("treasury"), fee_bps);
        c.add_role(Role::FieldAgent, acc("field"));
        c.add_role(Role::Coop, acc("coop"));
        c.add_role(Role::Coop, acc("field2"));
        c.add_role(Role::FieldAgent, acc("field2"));
        c.add_role(Role::Warehouse, acc("wh"));
        T { c, ctx }
    }

    fn as_(&mut self, who: &str) -> &mut Contract {
        self.as_with(who, 0)
    }

    fn as_with(&mut self, who: &str, yocto: u128) -> &mut Contract {
        testing_env!(
            self.ctx
                .predecessor_account_id(acc(who))
                .attached_deposit(NearToken::from_yoctonear(yocto))
                .build()
        );
        &mut self.c
    }

    fn register(&mut self) -> String {
        self.as_with("farmer", NearToken::from_millinear(100).as_yoctonear())
            .register_lot(
                "Rice".into(),
                Some("IR64".into()),
                "Subang".into(),
                KG,
                "2027-03".into(),
                HASH.into(),
                HASH.into(),
                Some(5_000),
                Some("https://example.org/lot.jpg".into()),
                None,
            )
    }

    fn listed(&mut self) -> String {
        let id = self.register();
        self.as_("field")
            .attest_field(id.clone(), HASH.into(), None, HASH.into(), None, None);
        self.as_("coop")
            .attest_coop(id.clone(), HASH2.into(), None, None);
        self.as_("farmer").list_lot(id.clone(), U128(PRICE));
        id
    }

    fn fund(&mut self, id: &str, who: &str, amount: u128) -> u128 {
        let msg = format!(r#"{{"action":"fund","lot_id":"{id}"}}"#);
        match self
            .as_("pusdc")
            .ft_on_transfer(acc(who), U128(amount), msg)
        {
            PromiseOrValue::Value(refund) => refund.0,
            PromiseOrValue::Promise(_) => panic!("expected a value"),
        }
    }

    fn funded(&mut self) -> String {
        let id = self.listed();
        assert_eq!(self.fund(&id, "buyer", TOTAL), 0);
        id
    }

    fn settled(&mut self, actual_kg: u64) -> String {
        let id = self.funded();
        self.as_("wh")
            .weigh_in(id.clone(), actual_kg, "A".into(), HASH.into(), None, None);
        id
    }

    fn lot(&self, id: &str) -> LotView {
        self.c.get_lot(id.to_string()).unwrap()
    }
}

// ---------- settlement math ----------

#[test]
fn settlement_full_delivery() {
    let s = compute_settlement(KG, KG, PRICE, TOTAL, 200);
    assert_eq!(
        (s.gross, s.farmer, s.treasury, s.holder),
        (TOTAL, 441_000_000, 9_000_000, 0)
    );
}

#[test]
fn settlement_under_delivery_reference_numbers() {
    let s = compute_settlement(KG, 900, PRICE, TOTAL, 200);
    assert_eq!(s.farmer, 396_900_000); // 396.90 pUSDC
    assert_eq!(s.treasury, 8_100_000); // 8.10
    assert_eq!(s.holder, 45_000_000); // 45.00
}

#[test]
fn settlement_over_delivery_is_capped() {
    let s = compute_settlement(KG, 1_500, PRICE, TOTAL, 200);
    assert_eq!(s.delivered_kg, KG);
    assert_eq!(s, compute_settlement(KG, KG, PRICE, TOTAL, 200));
}

#[test]
fn settlement_zero_delivery_refunds_everything() {
    let s = compute_settlement(KG, 0, PRICE, TOTAL, 200);
    assert_eq!((s.farmer, s.treasury, s.holder), (0, 0, TOTAL));
}

#[test]
fn settlement_fee_rounds_down_and_parts_sum_to_escrow() {
    // 7 kg × 3 = 21 gross; 21 × 333 / 10_000 = 0.6993 → fee 0.
    let s = compute_settlement(10, 7, 3, 30, 333);
    assert_eq!((s.gross, s.treasury, s.farmer, s.holder), (21, 0, 21, 9));
    for (actual, bps) in [(1, 1), (333, 999), (999, 1000), (1000, 7)] {
        let s = compute_settlement(KG, actual, 123_457, 123_457_000, bps);
        assert_eq!(s.farmer + s.treasury + s.holder, 123_457_000);
    }
}

#[test]
fn settlement_fee_zero_and_max() {
    let zero = compute_settlement(KG, 900, PRICE, TOTAL, 0);
    assert_eq!((zero.farmer, zero.treasury), (405_000_000, 0));
    let max = compute_settlement(KG, 900, PRICE, TOTAL, 1000);
    assert_eq!((max.farmer, max.treasury), (364_500_000, 40_500_000));
}

// ---------- registration ----------

#[test]
fn register_mints_nft_with_title_and_emits_events() {
    let mut t = T::new(200);
    let id = t.register();
    assert_eq!(id, "lot-1");
    let token = t.c.nft_token(id.clone()).unwrap();
    assert_eq!(token.owner_id, acc("farmer"));
    let md = token.metadata.unwrap();
    assert_eq!(md.title.unwrap(), "Rice · 1000 kg · 2027-03");
    assert_eq!(md.media.unwrap(), "https://example.org/lot.jpg");
    let logs = get_logs();
    assert!(
        logs.iter()
            .any(|l| l.contains(r#""standard":"nep171""#) && l.contains("nft_mint"))
    );
    let ev = logs.iter().find(|l| l.contains("lot_registered")).unwrap();
    assert!(ev.starts_with(
        r#"EVENT_JSON:{"standard":"pratala","version":"1.0.0","event":"lot_registered","data":[{"lot_id":"lot-1""#
    ));
    let lot = t.lot(&id);
    assert_eq!(lot.status, Status::Registered);
    assert_eq!(lot.holder, acc("farmer"));
    assert_eq!(lot.price_per_kg, U128(0));
    assert_eq!(t.register(), "lot-2");
}

#[test]
#[should_panic(expected = "attached deposit does not cover storage")]
fn register_requires_storage_deposit() {
    let mut t = T::new(200);
    t.as_with("farmer", 1).register_lot(
        "Rice".into(),
        None,
        "Subang".into(),
        KG,
        "2027-03".into(),
        HASH.into(),
        HASH.into(),
        None,
        None,
        None,
    );
}

#[test]
fn validation_helpers() {
    assert!(validate::is_hash(HASH2));
    assert!(!validate::is_hash(&HASH2.to_uppercase()));
    assert!(!validate::is_hash(&HASH2[..63]));
    assert!(validate::is_month("2027-12"));
    for bad in ["2027-13", "2027-00", "27-03", "2027/03", "2027-3"] {
        assert!(!validate::is_month(bad), "{bad}");
    }
}

#[test]
#[should_panic(expected = "harvest_month must be YYYY-MM")]
fn register_rejects_bad_month() {
    let mut t = T::new(200);
    t.as_with("farmer", NearToken::from_near(1).as_yoctonear())
        .register_lot(
            "Rice".into(),
            None,
            "S".into(),
            KG,
            "03-2027".into(),
            HASH.into(),
            HASH.into(),
            None,
            None,
            None,
        );
}

#[test]
#[should_panic(expected = "projected_kg must be greater than zero")]
fn register_rejects_zero_kg() {
    let mut t = T::new(200);
    t.as_with("farmer", NearToken::from_near(1).as_yoctonear())
        .register_lot(
            "Rice".into(),
            None,
            "S".into(),
            0,
            "2027-03".into(),
            HASH.into(),
            HASH.into(),
            None,
            None,
            None,
        );
}

#[test]
#[should_panic(expected = "string exceeds 256 bytes")]
fn register_rejects_long_strings() {
    let mut t = T::new(200);
    t.as_with("farmer", NearToken::from_near(1).as_yoctonear())
        .register_lot(
            "x".repeat(257),
            None,
            "S".into(),
            KG,
            "2027-03".into(),
            HASH.into(),
            HASH.into(),
            None,
            None,
            None,
        );
}

// ---------- roles and state machine ----------

#[test]
fn roles_and_admin() {
    let mut t = T::new(200);
    assert_eq!(t.c.get_roles(acc("owner")), vec![Role::Admin]);
    assert_eq!(
        t.c.get_roles(acc("field2")),
        vec![Role::FieldAgent, Role::Coop]
    );
    assert_eq!(t.c.list_role(Role::Admin), vec![acc("owner")]);
    assert!(!t.as_("owner").add_role(Role::Warehouse, acc("wh")));
    assert!(t.as_("owner").remove_role(Role::Warehouse, acc("wh")));
    assert!(t.c.get_roles(acc("wh")).is_empty());
}

#[test]
#[should_panic(expected = "only the contract owner")]
fn add_role_requires_owner() {
    T::new(200)
        .as_("farmer")
        .add_role(Role::Coop, acc("farmer"));
}

#[test]
#[should_panic(expected = "Admin is the contract owner")]
fn admin_role_is_not_assignable() {
    T::new(200).as_("owner").add_role(Role::Admin, acc("x"));
}

#[test]
#[should_panic(expected = "fee_bps must be <= 1000")]
fn fee_is_capped() {
    T::new(200).as_("owner").set_fee_bps(1001);
}

#[test]
#[should_panic(expected = "caller is not a FieldAgent")]
fn attest_field_requires_field_agent() {
    let mut t = T::new(200);
    let id = t.register();
    t.as_("coop")
        .attest_field(id, HASH.into(), None, HASH.into(), None, None);
}

#[test]
#[should_panic(expected = "coop reviewer must differ from the field agent")]
fn coop_cannot_be_field_signer() {
    let mut t = T::new(200);
    let id = t.register();
    t.as_("field2")
        .attest_field(id.clone(), HASH.into(), None, HASH.into(), None, None);
    t.as_("field2").attest_coop(id, HASH.into(), None, None);
}

#[test]
#[should_panic(expected = "farmer cannot attest their own lot")]
fn farmer_cannot_self_attest() {
    let mut t = T::new(200);
    t.as_("owner").add_role(Role::FieldAgent, acc("farmer"));
    let id = t.register();
    t.as_("farmer")
        .attest_field(id, HASH.into(), None, HASH.into(), None, None);
}

#[test]
#[should_panic(expected = "hash must be 64 lowercase hex")]
fn attest_rejects_bad_hash() {
    let mut t = T::new(200);
    let id = t.register();
    t.as_("field")
        .attest_field(id, "abc".into(), None, HASH.into(), None, None);
}

#[test]
#[should_panic(expected = "status does not allow")]
fn coop_before_field_rejected() {
    let mut t = T::new(200);
    let id = t.register();
    t.as_("coop").attest_coop(id, HASH.into(), None, None);
}

#[test]
#[should_panic(expected = "status does not allow")]
fn list_before_coop_rejected() {
    let mut t = T::new(200);
    let id = t.register();
    t.as_("farmer").list_lot(id, U128(PRICE));
}

#[test]
#[should_panic(expected = "only the lot farmer")]
fn list_requires_farmer() {
    let mut t = T::new(200);
    let id = t.listed();
    t.as_("buyer").update_price(id, U128(1));
}

#[test]
fn list_update_delist_and_cancel() {
    let mut t = T::new(200);
    let id = t.listed();
    assert_eq!(t.c.quote_funding(id.clone()), U128(TOTAL));
    t.as_("farmer").update_price(id.clone(), U128(500_000));
    assert_eq!(t.lot(&id).funding_total, U128(500_000_000));
    t.as_("farmer").delist_lot(id.clone());
    assert_eq!(t.lot(&id).status, Status::CoopVerified);
    assert_eq!(t.lot(&id).price_per_kg, U128(0));
    t.as_("owner").cancel_lot(id.clone());
    assert_eq!(t.lot(&id).status, Status::Cancelled);
    assert_eq!(t.c.get_stats().verified_lots, 1);
}

#[test]
#[should_panic(expected = "status does not allow")]
fn cancel_listed_rejected() {
    let mut t = T::new(200);
    let id = t.listed();
    t.as_("farmer").cancel_lot(id);
}

#[test]
#[should_panic(expected = "status does not allow")]
fn weigh_in_before_funding_rejected() {
    let mut t = T::new(200);
    let id = t.listed();
    t.as_("wh")
        .weigh_in(id, 900, "A".into(), HASH.into(), None, None);
}

#[test]
#[should_panic(expected = "caller is not a Warehouse")]
fn weigh_in_requires_warehouse() {
    let mut t = T::new(200);
    let id = t.funded();
    t.as_("coop")
        .weigh_in(id, 900, "A".into(), HASH.into(), None, None);
}

#[test]
#[should_panic(expected = "status does not allow")]
fn double_weigh_in_rejected() {
    let mut t = T::new(200);
    let id = t.settled(900);
    t.as_("wh")
        .weigh_in(id, 900, "A".into(), HASH.into(), None, None);
}

#[test]
#[should_panic(expected = "contract is paused")]
fn pause_blocks_registration() {
    let mut t = T::new(200);
    t.as_("owner").set_paused(true);
    t.register();
}

// ---------- funding (ft_on_transfer) ----------

#[test]
fn funding_moves_nft_and_returns_excess() {
    let mut t = T::new(200);
    let id = t.listed();
    assert_eq!(t.fund(&id, "buyer", TOTAL + 7), 7);
    let lot = t.lot(&id);
    assert_eq!(lot.status, Status::Funded);
    assert_eq!(lot.escrow, U128(TOTAL));
    assert_eq!(lot.holder, acc("buyer"));
    assert_eq!(lot.funder, Some(acc("buyer")));
    assert_eq!(lot.fee_bps, 200);
    let logs = get_logs();
    assert!(
        logs.iter()
            .any(|l| l.contains("nft_transfer") && l.contains("buyer.near"))
    );
    assert!(
        logs.iter()
            .any(|l| l.contains("lot_funded") && l.contains(r#""refund":"7""#))
    );
}

#[test]
fn fee_is_frozen_at_funding() {
    let mut t = T::new(200);
    let id = t.funded();
    t.as_("owner").set_fee_bps(1000);
    t.as_("wh")
        .weigh_in(id.clone(), 900, "A".into(), HASH.into(), None, None);
    assert_eq!(t.c.get_claims(id).treasury, U128(8_100_000));
}

#[test]
#[should_panic(expected = "only the configured pUSDC contract")]
fn funding_rejects_other_tokens() {
    let mut t = T::new(200);
    let id = t.listed();
    let msg = format!(r#"{{"action":"fund","lot_id":"{id}"}}"#);
    let _ = t
        .as_("fake-usdc")
        .ft_on_transfer(acc("buyer"), U128(TOTAL), msg);
}

#[test]
fn funding_msg_parsing() {
    for (msg, ok) in [
        (r#"{"action":"fund","lot_id":"lot-1"}"#, true),
        (r#"{"lot_id":"lot-1","action":"fund"}"#, true),
        (r#"{"action":"buy","lot_id":"lot-1"}"#, false),
        (r#"{"action":"fund"}"#, false),
        (r#"{"action":"fund","lot_id":"lot-1","x":1}"#, false),
        ("lot-1", false),
        ("", false),
    ] {
        assert_eq!(
            serde_json::from_str::<TransferMsg>(msg).is_ok(),
            ok,
            "{msg}"
        );
    }
}

#[test]
#[should_panic(expected = "msg must be")]
fn funding_rejects_bad_msg() {
    let mut t = T::new(200);
    t.listed();
    let _ = t
        .as_("pusdc")
        .ft_on_transfer(acc("buyer"), U128(TOTAL), "fund lot-1".into());
}

#[test]
#[should_panic(expected = "amount is below the funding total")]
fn funding_rejects_under_amount() {
    let mut t = T::new(200);
    let id = t.listed();
    t.fund(&id, "buyer", TOTAL - 1);
}

#[test]
#[should_panic(expected = "status does not allow")]
fn double_funding_rejected() {
    let mut t = T::new(200);
    let id = t.funded();
    t.fund(&id, "investor2", TOTAL);
}

#[test]
#[should_panic(expected = "farmer cannot fund their own lot")]
fn farmer_cannot_fund_own_lot() {
    let mut t = T::new(200);
    let id = t.listed();
    t.fund(&id, "farmer", TOTAL);
}

#[test]
#[should_panic(expected = "contract is paused")]
fn pause_blocks_funding() {
    let mut t = T::new(200);
    let id = t.listed();
    t.as_("owner").set_paused(true);
    t.fund(&id, "buyer", TOTAL);
}

// ---------- transfer guard ----------

#[test]
#[should_panic(expected = "only move once the lot is funded")]
fn nft_not_transferable_before_funding() {
    let mut t = T::new(200);
    let id = t.listed();
    t.as_with("farmer", 1)
        .nft_transfer(acc("x"), id, None, None);
}

#[test]
#[should_panic(expected = "only move once the lot is funded")]
fn nft_not_transferable_when_cancelled() {
    let mut t = T::new(200);
    let id = t.register();
    t.as_("farmer").cancel_lot(id.clone());
    t.as_with("farmer", 1)
        .nft_transfer(acc("x"), id, None, None);
}

#[test]
fn nft_transferable_when_funded_and_holder_follows() {
    let mut t = T::new(200);
    let id = t.funded();
    t.as_with("buyer", 1)
        .nft_transfer(acc("investor2"), id.clone(), None, None);
    assert_eq!(t.lot(&id).holder, acc("investor2"));
    assert_eq!(t.c.get_lots_for_holder(acc("investor2")).len(), 1);
    assert!(t.c.get_lots_for_holder(acc("buyer")).is_empty());
}

// ---------- claims ----------

#[test]
fn claim_sets_lock_and_blocks_transfer_until_callback() {
    let mut t = T::new(200);
    let id = t.settled(900);
    let _ = t.as_("buyer").claim_refund(id.clone());
    let lot = t.lot(&id);
    assert!(lot.claim_lock);
    assert_eq!(lot.claims.holder, U128(0));

    // Mid-payout: the holder cannot sell the NFT out from under the in-flight refund.
    let blocked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        t.as_with("buyer", 1)
            .nft_transfer(acc("investor2"), id.clone(), None, None)
    }));
    assert!(blocked.is_err());
    // A second claim of any kind is rejected while locked.
    let second = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = t.as_("farmer").claim_payout(id.clone());
    }));
    assert!(second.is_err());

    // ft_transfer failed (e.g. receiver not registered): claim restored, lock cleared.
    let ok = t.as_("lots").on_claim_resolved(
        id.clone(),
        ClaimKind::Holder,
        acc("buyer"),
        U128(45_000_000),
        Err(PromiseError::Failed),
    );
    assert!(!ok);
    let lot = t.lot(&id);
    assert!(!lot.claim_lock);
    assert_eq!(lot.claims.holder, U128(45_000_000));
    assert_eq!(lot.escrow, U128(TOTAL));
    assert!(
        get_logs()
            .iter()
            .any(|l| l.contains("payout_claimed") && l.contains(r#""ok":false"#))
    );

    // Unlocked: transfer works again and the new holder owns the restored claim.
    t.as_with("buyer", 1)
        .nft_transfer(acc("investor2"), id.clone(), None, None);
    assert_eq!(t.lot(&id).holder, acc("investor2"));
}

#[test]
fn successful_claims_drain_escrow_and_update_stats() {
    let mut t = T::new(200);
    let id = t.settled(900);
    for (who, kind, to, amount) in [
        ("farmer", ClaimKind::Farmer, "farmer", 396_900_000u128),
        ("buyer", ClaimKind::Holder, "buyer", 45_000_000),
        ("treasury", ClaimKind::Treasury, "treasury", 8_100_000),
    ] {
        let _ = match kind {
            ClaimKind::Farmer => t.as_(who).claim_payout(id.clone()),
            ClaimKind::Holder => t.as_(who).claim_refund(id.clone()),
            ClaimKind::Treasury => t.as_(who).claim_fee(id.clone()),
        };
        assert!(
            t.as_("lots")
                .on_claim_resolved(id.clone(), kind, acc(to), U128(amount), Ok(()))
        );
    }
    let lot = t.lot(&id);
    assert_eq!(lot.escrow, U128(0));
    assert_eq!(lot.claims, Claims::default());
    let stats = t.c.get_stats();
    assert_eq!(stats.farmer_paid, U128(396_900_000));
    assert_eq!(stats.settled_volume, U128(405_000_000));
    assert_eq!((stats.funded_lots, stats.settled_lots), (1, 1));
}

#[test]
#[should_panic(expected = "only the current NFT holder")]
fn previous_holder_cannot_claim_refund() {
    let mut t = T::new(200);
    let id = t.funded();
    t.as_with("buyer", 1)
        .nft_transfer(acc("investor2"), id.clone(), None, None);
    t.as_("wh")
        .weigh_in(id.clone(), 900, "A".into(), HASH.into(), None, None);
    let _ = t.as_("buyer").claim_refund(id);
}

#[test]
#[should_panic(expected = "nothing to claim")]
fn farmer_has_nothing_after_crop_failure() {
    let mut t = T::new(200);
    let id = t.funded();
    t.as_("coop")
        .declare_failure(id.clone(), "Flood".into(), HASH.into());
    assert_eq!(t.c.get_claims(id.clone()).holder, U128(TOTAL));
    assert_eq!(t.lot(&id).status, Status::Refunded);
    let _ = t.as_("farmer").claim_payout(id);
}

#[test]
#[should_panic(expected = "status does not allow")]
fn claim_before_settlement_rejected() {
    let mut t = T::new(200);
    let id = t.funded();
    let _ = t.as_("buyer").claim_refund(id);
}

#[test]
#[should_panic(expected = "only the owner or the treasury")]
fn fee_claim_requires_owner_or_treasury() {
    let mut t = T::new(200);
    let id = t.settled(900);
    let _ = t.as_("farmer").claim_fee(id);
}

#[test]
#[should_panic(expected = "attach at least 40 Tgas")]
fn claim_requires_gas_for_callback() {
    let mut t = T::new(200);
    let id = t.settled(900);
    testing_env!(
        t.ctx
            .predecessor_account_id(acc("farmer"))
            .prepaid_gas(near_sdk::Gas::from_tgas(30))
            .build()
    );
    let _ = t.c.claim_payout(id);
}

#[test]
fn claims_stay_open_while_paused() {
    let mut t = T::new(200);
    let id = t.settled(900);
    t.as_("owner").set_paused(true);
    let _ = t.as_("farmer").claim_payout(id.clone());
    assert!(t.lot(&id).claim_lock);
}

#[test]
fn views_paginate_and_filter() {
    let mut t = T::new(200);
    t.funded();
    t.register();
    assert_eq!(t.c.get_lots(None, None).len(), 2);
    assert_eq!(t.c.get_lots(Some(1), Some(5))[0].lot_id, "lot-2");
    assert_eq!(t.c.get_lots_by_status(Status::Funded, None, None).len(), 1);
    assert_eq!(t.c.get_lots_by_farmer(acc("farmer")).len(), 2);
    assert!(t.c.get_lot("lot-9".into()).is_none());
    let cfg = t.c.get_config();
    assert_eq!((cfg.fee_bps, cfg.total_lots, cfg.paused), (200, 2, false));
}

#[test]
fn registration_storage_cost_fits_in_0_1_near() {
    let mut t = T::new(200);
    let before = near_sdk::env::storage_usage();
    t.register();
    let used = near_sdk::env::storage_usage() - before;
    let kept = near_sdk::env::storage_byte_cost()
        .saturating_mul((used + lifecycle::LOT_STORAGE_RESERVE_BYTES) as u128);
    println!("register_lot: {used} bytes measured, {kept} kept");
    assert!(kept < NearToken::from_millinear(100));
}
