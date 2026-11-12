//! Sandbox harness: builds both contracts with cargo-near-build, starts near-sandbox, deploys
//! pUSDC then harvest-lot, grants roles, registers actors on pUSDC and mints to the buyer.
//!
//! Stack per docs.near.org/smart-contracts/testing/integration-test:
//! near-sandbox 0.4 + near-api 0.8.7 + cargo-near-build 0.11.5.

#![allow(dead_code)]

use std::sync::{Arc, LazyLock};

use cargo_near_build::BuildOpts;
use near_api::types::Action;
use near_api::types::transaction::actions::FunctionCallAction;
use near_api::types::transaction::result::ExecutionFinalResult;
use near_api::{AccountId, Contract, NearGas, NearToken, NetworkConfig, Signer, Transaction};
use near_sandbox::Sandbox;
use near_sdk::serde::de::DeserializeOwned;
use near_sdk::serde_json::{Value, json};

pub const PUSDC: u128 = 1_000_000; // 1 pUSDC in base units
pub const KG: u64 = 1_000;
pub const PRICE: u128 = 450_000; // 0.45 pUSDC / kg
pub const TOTAL: u128 = 450_000_000; // 450 pUSDC
pub const BUYER_FUNDS: u128 = 1_000 * PUSDC;
pub const FEE_BPS: u16 = 200;
pub const HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
pub const HASH2: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

pub const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
pub const NO_DEPOSIT: NearToken = NearToken::from_yoctonear(0);
/// register_lot storage deposit — 0.6 NEAR, excess refunded by the contract.
pub const REGISTER_DEPOSIT: NearToken = NearToken::from_millinear(600);

fn build(manifest: &str) -> Vec<u8> {
    let artifact = cargo_near_build::build_with_cli(BuildOpts {
        manifest_path: Some(manifest.into()),
        no_abi: true,
        no_embed_abi: true,
        no_locked: true,
        ..Default::default()
    })
    .unwrap_or_else(|e| panic!("could not build {manifest}: {e:?}"));
    std::fs::read(&artifact).unwrap_or_else(|e| panic!("could not read {artifact}: {e}"))
}

// Integration tests run with the package directory (contracts/harvest-lot) as cwd.
static LOTS_WASM: LazyLock<Vec<u8>> = LazyLock::new(|| build("Cargo.toml"));
static PUSDC_WASM: LazyLock<Vec<u8>> = LazyLock::new(|| build("../pusdc/Cargo.toml"));

pub struct World {
    pub sandbox: Sandbox,
    pub net: NetworkConfig,
    pub signer: Arc<Signer>,
    pub pusdc: AccountId,
    pub lots: AccountId,
    pub owner: AccountId,
    pub treasury: AccountId,
    pub farmer: AccountId,
    pub field: AccountId,
    pub coop: AccountId,
    pub warehouse: AccountId,
    pub buyer: AccountId,
    /// Deliberately NOT registered on pUSDC, so payouts to it fail until it registers.
    pub investor2: AccountId,
}

impl World {
    pub async fn new() -> anyhow::Result<Self> {
        let sandbox = Sandbox::start_sandbox().await?;
        let net = NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
        let signer = Signer::from_secret_key(
            near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?,
        )?;

        let mut ids = Vec::new();
        for name in [
            "pusdc",
            "lots",
            "owner",
            "treasury",
            "farmer",
            "field",
            "coop",
            "warehouse",
            "buyer",
            "investor2",
        ] {
            let id: AccountId = format!("{name}.sandbox").parse()?;
            sandbox
                .create_account(id.as_str().parse()?)
                .initial_balance(NearToken::from_near(30))
                .send()
                .await?;
            ids.push(id);
        }
        let [
            pusdc,
            lots,
            owner,
            treasury,
            farmer,
            field,
            coop,
            warehouse,
            buyer,
            investor2,
        ] = <[AccountId; 10]>::try_from(ids).expect("ten accounts");
        let w = World {
            sandbox,
            net,
            signer,
            pusdc,
            lots,
            owner,
            treasury,
            farmer,
            field,
            coop,
            warehouse,
            buyer,
            investor2,
        };

        Contract::deploy(w.pusdc.clone())
            .use_code(PUSDC_WASM.clone())
            .with_init_call(
                "new",
                json!({
                    "owner_id": w.owner,
                    "total_supply": "0",
                    "metadata": {"spec": "ft-1.0.0", "name": "Pratala Test USDC",
                                 "symbol": "pUSDC", "decimals": 6},
                }),
            )?
            .with_signer(w.signer.clone())
            .send_to(&w.net)
            .await?
            .assert_success();
        Contract::deploy(w.lots.clone())
            .use_code(LOTS_WASM.clone())
            .with_init_call(
                "new",
                json!({"owner_id": w.owner, "usdc_contract": w.pusdc,
                       "treasury": w.treasury, "fee_bps": FEE_BPS}),
            )?
            .with_signer(w.signer.clone())
            .send_to(&w.net)
            .await?
            .assert_success();

        for (role, who) in [
            ("FieldAgent", &w.field),
            ("Coop", &w.coop),
            ("Warehouse", &w.warehouse),
        ] {
            w.call_ok(
                &w.owner,
                &w.lots,
                "add_role",
                json!({"role": role, "account_id": who}),
            )
            .await?;
        }
        for who in [&w.lots, &w.treasury, &w.farmer, &w.buyer] {
            w.register_ft(who).await?;
        }
        w.call_ok(
            &w.owner,
            &w.pusdc,
            "mint",
            json!({"account_id": w.buyer, "amount": BUYER_FUNDS.to_string()}),
        )
        .await?;
        Ok(w)
    }

    /// Sends a function call and returns the final execution result (success or failure).
    pub async fn call(
        &self,
        caller: &AccountId,
        contract: &AccountId,
        method: &str,
        args: Value,
        deposit: NearToken,
        tgas: u64,
    ) -> anyhow::Result<ExecutionFinalResult> {
        let result = Contract(contract.clone())
            .call_function(method, args)
            .transaction()
            .deposit(deposit)
            .gas(NearGas::from_tgas(tgas))
            .with_signer(caller.clone(), self.signer.clone())
            .send_to(&self.net)
            .await?;
        result
            .into_full()
            .ok_or_else(|| anyhow::anyhow!("{method} still pending"))
    }

    /// One transaction, several function-call actions to `contract`. All actions run in the
    /// same receipt, so a later action observes state written by an earlier one, and a panic
    /// in any action reverts all of them.
    pub async fn batch(
        &self,
        caller: &AccountId,
        contract: &AccountId,
        calls: Vec<(&str, Value, NearToken)>,
    ) -> anyhow::Result<ExecutionFinalResult> {
        let mut tx = Transaction::construct(caller.clone(), contract.clone());
        for (method, args, deposit) in calls {
            tx = tx.add_action(Action::FunctionCall(Box::new(FunctionCallAction {
                method_name: method.into(),
                args: near_sdk::serde_json::to_vec(&args)?,
                gas: NearGas::from_tgas(100),
                deposit,
            })));
        }
        tx.with_signer(self.signer.clone())
            .send_to(&self.net)
            .await?
            .into_full()
            .ok_or_else(|| anyhow::anyhow!("batch still pending"))
    }

    /// Zero-deposit call that must succeed.
    pub async fn call_ok(
        &self,
        caller: &AccountId,
        contract: &AccountId,
        method: &str,
        args: Value,
    ) -> anyhow::Result<()> {
        let res = self
            .call(caller, contract, method, args, NO_DEPOSIT, 100)
            .await?;
        anyhow::ensure!(res.is_success(), "{method} failed: {:?}", res.failures());
        Ok(())
    }

    /// Zero-deposit call that must fail with a message containing `expected`.
    pub async fn call_err(
        &self,
        caller: &AccountId,
        contract: &AccountId,
        method: &str,
        args: Value,
        expected: &str,
    ) -> anyhow::Result<()> {
        let res = self
            .call(caller, contract, method, args, NO_DEPOSIT, 100)
            .await?;
        assert_failed_with(&res, expected);
        Ok(())
    }

    pub async fn view<T: DeserializeOwned + Send + Sync>(
        &self,
        contract: &AccountId,
        method: &str,
        args: Value,
    ) -> anyhow::Result<T> {
        Ok(Contract(contract.clone())
            .call_function(method, args)
            .read_only()
            .fetch_from(&self.net)
            .await?
            .data)
    }

    pub async fn ft_balance(&self, who: &AccountId) -> anyhow::Result<u128> {
        let v: String = self
            .view(&self.pusdc, "ft_balance_of", json!({"account_id": who}))
            .await?;
        Ok(v.parse()?)
    }

    pub async fn lot(&self, lot_id: &str) -> anyhow::Result<Value> {
        self.view(&self.lots, "get_lot", json!({"lot_id": lot_id}))
            .await
    }

    pub async fn nft_owner(&self, lot_id: &str) -> anyhow::Result<String> {
        let token: Value = self
            .view(&self.lots, "nft_token", json!({"token_id": lot_id}))
            .await?;
        Ok(token["owner_id"].as_str().unwrap_or_default().to_string())
    }

    pub async fn register_ft(&self, who: &AccountId) -> anyhow::Result<()> {
        let bounds: Value = self
            .view(&self.pusdc, "storage_balance_bounds", json!({}))
            .await?;
        let min: u128 = bounds["min"].as_str().unwrap().parse()?;
        let res = self
            .call(
                who,
                &self.pusdc,
                "storage_deposit",
                json!({"account_id": who}),
                NearToken::from_yoctonear(min),
                30,
            )
            .await?;
        anyhow::ensure!(res.is_success(), "storage_deposit failed");
        Ok(())
    }

    /// Registers a 1,000 kg rice lot and walks it to Listed at 0.45 pUSDC/kg.
    pub async fn listed_lot(&self) -> anyhow::Result<String> {
        let res = self
            .call(
                &self.farmer,
                &self.lots,
                "register_lot",
                json!({
                    "crop": "Rice", "variety": "IR64", "region": "Subang, West Java",
                    "projected_kg": KG, "harvest_month": "2027-03",
                    "plot_hash": HASH, "gps_hash": HASH, "area_m2": 5000,
                    "media_uri": "https://example.org/lot.jpg",
                }),
                REGISTER_DEPOSIT,
                50,
            )
            .await?;
        anyhow::ensure!(
            res.is_success(),
            "register_lot failed: {:?}",
            res.failures()
        );
        let lot_id: String = res.json()?;
        self.call_ok(
            &self.field,
            &self.lots,
            "attest_field",
            json!({"lot_id": lot_id, "evidence_hash": HASH, "gps_hash": HASH,
                   "evidence_uri": "https://api.example.org/api/evidence/aa"}),
        )
        .await?;
        self.call_ok(
            &self.coop,
            &self.lots,
            "attest_coop",
            json!({"lot_id": lot_id, "evidence_hash": HASH2, "note": "Co-op review ok"}),
        )
        .await?;
        self.call_ok(
            &self.farmer,
            &self.lots,
            "list_lot",
            json!({"lot_id": lot_id, "price_per_kg": PRICE.to_string()}),
        )
        .await?;
        Ok(lot_id)
    }

    /// `ft_transfer_call` on pUSDC buying `kg` (defaults to the exact cost). The outer tx
    /// succeeds even when `ft_on_transfer` panics (the FT refunds), so callers assert on
    /// balances and state.
    pub async fn fund(
        &self,
        from: &AccountId,
        lot_id: &str,
        kg: u64,
    ) -> anyhow::Result<ExecutionFinalResult> {
        self.fund_kg(from, lot_id, kg, kg as u128 * PRICE).await
    }

    pub async fn fund_kg(
        &self,
        from: &AccountId,
        lot_id: &str,
        kg: u64,
        amount: u128,
    ) -> anyhow::Result<ExecutionFinalResult> {
        self.fund_msg(
            from,
            amount,
            &format!(r#"{{"action":"fund","lot_id":"{lot_id}","kg":{kg}}}"#),
        )
        .await
    }

    pub async fn fund_msg(
        &self,
        from: &AccountId,
        amount: u128,
        msg: &str,
    ) -> anyhow::Result<ExecutionFinalResult> {
        self.call(
            from,
            &self.pusdc,
            "ft_transfer_call",
            json!({"receiver_id": self.lots, "amount": amount.to_string(), "msg": msg}),
            ONE_YOCTO,
            100,
        )
        .await
    }

    /// Registers + funds investor2, then sells the whole lot in two purchases
    /// (700 kg to buyer, 300 kg to investor2) → sold out → Funded.
    pub async fn funded_split(&self) -> anyhow::Result<String> {
        let lot_id = self.listed_lot().await?;
        self.register_ft(&self.investor2).await?;
        self.call_ok(
            &self.owner,
            &self.pusdc,
            "mint",
            json!({"account_id": self.investor2, "amount": BUYER_FUNDS.to_string()}),
        )
        .await?;
        let res = self.fund(&self.buyer, &lot_id, 700).await?;
        anyhow::ensure!(
            res.is_success(),
            "first purchase failed: {:?}",
            res.failures()
        );
        let res = self.fund(&self.investor2, &lot_id, 300).await?;
        anyhow::ensure!(
            res.is_success(),
            "second purchase failed: {:?}",
            res.failures()
        );
        Ok(lot_id)
    }

    pub async fn funded_lot(&self) -> anyhow::Result<String> {
        let lot_id = self.listed_lot().await?;
        let res = self.fund(&self.buyer, &lot_id, KG).await?;
        anyhow::ensure!(res.is_success(), "funding failed: {:?}", res.failures());
        Ok(lot_id)
    }

    pub async fn weigh_in(&self, lot_id: &str, actual_kg: u64) -> anyhow::Result<()> {
        self.call_ok(
            &self.warehouse,
            &self.lots,
            "weigh_in",
            json!({"lot_id": lot_id, "actual_kg": actual_kg, "grade": "A",
                   "evidence_hash": HASH2, "ai_check_hash": HASH}),
        )
        .await?;
        Ok(())
    }

    /// Claims a lot-scoped payout (`claim_payout` / `claim_fee`); returns the callback's bool.
    pub async fn claim(&self, who: &AccountId, method: &str, lot_id: &str) -> anyhow::Result<bool> {
        let res = self
            .call(
                who,
                &self.lots,
                method,
                json!({"lot_id": lot_id}),
                NO_DEPOSIT,
                60,
            )
            .await?;
        anyhow::ensure!(res.is_success(), "{method} failed: {:?}", res.failures());
        Ok(res.json()?)
    }

    /// Claims a share NFT's refund; returns the callback's bool (`true` = paid).
    pub async fn claim_share(
        &self,
        who: &AccountId,
        share_id: &str,
    ) -> anyhow::Result<ExecutionFinalResult> {
        self.call(
            who,
            &self.lots,
            "claim_refund",
            json!({"share_id": share_id}),
            NO_DEPOSIT,
            60,
        )
        .await
    }

    pub async fn share(&self, share_id: &str) -> anyhow::Result<Value> {
        self.view(&self.lots, "get_share", json!({"share_id": share_id}))
            .await
    }

    pub async fn claims(&self, lot_id: &str) -> anyhow::Result<(u128, u128, u128)> {
        let c: Value = self
            .view(&self.lots, "get_claims", json!({"lot_id": lot_id}))
            .await?;
        let n = |k: &str| c[k].as_str().unwrap().parse::<u128>().unwrap();
        Ok((n("farmer"), n("holder"), n("treasury")))
    }
}

pub fn assert_failed_with(res: &ExecutionFinalResult, expected: &str) {
    let text = format!("{:?}", res.failures());
    assert!(
        !res.failures().is_empty() && text.contains(expected),
        "expected failure containing {expected:?}, got {text}"
    );
}

/// Returns the `EVENT_JSON` payloads emitted under `standard` with `event` name.
pub fn events(res: &ExecutionFinalResult, standard: &str, event: &str) -> Vec<Value> {
    res.logs()
        .into_iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .filter_map(|l| near_sdk::serde_json::from_str::<Value>(l).ok())
        .filter(|e| e["standard"] == standard && e["event"] == event)
        .collect()
}
