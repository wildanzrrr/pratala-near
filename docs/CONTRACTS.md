# Contracts

Two Rust contracts in [`smart-contract/`](../smart-contract/) (near-sdk 5.30.1, near-contract-standards 5.30.1, Rust 1.95.0). The shared ABI summary other workstreams code against is [`INTERFACES.md`](INTERFACES.md) §3–4; this file is the full reference. How the NFT carries money and control is in [`NFT-CONTROL.md`](NFT-CONTROL.md).

| Contract | Testnet id (see `deploy/testnet.json`) | Standards |
| --- | --- | --- |
| `harvest-lot` | `lots.pratala.testnet` | NEP-171 core, NEP-177 metadata, NEP-178 approvals, NEP-181 enumeration, NEP-297 events, NEP-141 receiver (`ft_on_transfer`) |
| `pusdc` | `pusdc.pratala.testnet` | NEP-141, NEP-145 storage, NEP-148 metadata (6 decimals) |

Build and test from `smart-contract/`: `make build` → `target/near/{pusdc/pusdc,harvest_lot/harvest_lot}.wasm`; `make test` → unit + sandbox integration tests.

## 1. `harvest-lot`

### 1.1 Lifecycle

```text
register_lot ─► Registered ─attest_field─► FieldVerified ─attest_coop─► CoopVerified ⇄ Listed
                    │                           │                          │   (list_lot / delist_lot)
                    └──────────── cancel_lot ───┴──────────────────────────┘──► Cancelled
Listed ─ft_transfer_call(fund)─► Funded ─weigh_in─► Settled
                                    └─declare_failure─► Refunded
Settled / Refunded: claim_payout · claim_refund · claim_fee (pull, one at a time per lot)
```

The NFT `token_id` is the `lot_id` (`"lot-1"`, `"lot-2"`, …). It is minted to the farmer at registration and moved farmer → buyer by funding. It can be transferred only in Funded / Settled / Refunded and never while a payout is in flight.

### 1.2 Change methods

Deposit "0" means the method is not payable: attaching NEAR fails. Those methods can be signed with a function-call access key.

| Method | Args | Caller | Deposit | Effect / events |
| --- | --- | --- | --- | --- |
| `new` | `owner_id, usdc_contract, treasury, fee_bps` | init (once) | — | `fee_bps ≤ 1000`. NFT collection metadata `nft-1.0.0`, "Pratala Harvest Lots", `PRATALA`. |
| `add_role` / `remove_role` | `role` (`FieldAgent`/`Coop`/`Warehouse`), `account_id` | owner | 0 | Returns `true` if changed. `role_changed`. `Admin` is the owner and cannot be assigned. |
| `set_fee_bps` | `fee_bps` | owner | 0 | `≤ 1000`; applies to lots funded afterwards. |
| `set_treasury` | `account_id` | owner | 0 | Future `claim_fee` payouts go to the new treasury. |
| `set_paused` | `paused` | owner | 0 | See §1.6. |
| `register_lot` | `crop, variety?, region, projected_kg, harvest_month, plot_hash, gps_hash, area_m2?, media_uri?, reference?` | anyone (becomes farmer) | storage + reserve (attach 0.6 NEAR; 48 KB reserve pre-pays share mints) | Validates input (§1.5), mints the **certificate NFT** to the caller, → Registered, returns `lot_id`. `nft_mint` (nep171) + `lot_registered`. |
| `attest_field` | `lot_id, evidence_hash, evidence_uri?, gps_hash, ai_check_hash?, note?` | FieldAgent, ≠ farmer | 0 | Registered → FieldVerified. `lot_attested{kind:"FieldVisit"}`. |
| `attest_coop` | `lot_id, evidence_hash, evidence_uri?, note?` | Coop, ≠ farmer, ≠ field signer | 0 | FieldVerified → CoopVerified. `lot_attested{kind:"CoopReview"}`. |
| `list_lot` | `lot_id, price_per_kg` (U128) | farmer | 0 | CoopVerified → Listed. `price > 0`, `projected_kg × price` must not overflow. `lot_listed{price_per_kg, total}`. |
| `update_price` | `lot_id, price_per_kg` | farmer | 0 | Listed → Listed, requires `sold_kg == 0` (sold kg cannot be repriced). Re-emits `lot_listed`. |
| `delist_lot` | `lot_id` | farmer | 0 | Listed → CoopVerified, price reset to `"0"`; requires `sold_kg == 0`. `lot_delisted`. |
| `close_funding` | `lot_id` | farmer or owner | 0 | Listed → Funded with partial escrow; requires `sold_kg > 0`; not blocked by pause. `lot_funding_closed{sold_kg, projected_kg, closed_by}`. |
| `cancel_lot` | `lot_id` | farmer or owner | 0 | Registered/FieldVerified/CoopVerified → Cancelled; requires `sold_kg == 0`. `lot_cancelled`. |
| `ft_on_transfer` | via pUSDC `ft_transfer_call` (§1.4), msg carries `kg` | pUSDC contract only | — | Buys `kg` of a Listed lot (≤ remaining, ≤ 64 shares/lot): `escrow += kg × price`, mints the buyer a **share NFT** `"{lot_id}:{n}"`; sell-out → Funded. `nft_mint` (nep171) + `lot_funded{buyer, kg, amount, refund, sold_kg, share_id}` (+ `lot_funding_closed` on sell-out). |
| `weigh_in` | `lot_id, actual_kg, grade, evidence_hash, evidence_uri?, ai_check_hash?` | Warehouse, ≠ farmer | 0 | Funded → Settled, computes claims (§1.3). `lot_attested{kind:"WarehouseWeighIn"}` + `lot_settled`. |
| `declare_failure` | `lot_id, reason, evidence_hash` | Coop or owner | 0 | Funded → Refunded, `claims.holder = escrow`. `lot_attested{kind:"CropFailure"}` + `lot_refunded`. |
| `claim_payout` | `lot_id` | farmer | 0, ≥ 40 Tgas (send 60) | Pays `claims.farmer` to the farmer. |
| `claim_refund` | `share_id` | **current share NFT owner** | 0, ≥ 40 Tgas | Pays that share's entitlement `floor(holder_pool × kg / sold_kg)` once (`share.claimed` flag); the share NFT stays as a transferable receipt. |
| `claim_fee` | `lot_id` | owner or treasury | 0, ≥ 40 Tgas | Pays `claims.treasury` to the configured treasury. |
| `on_claim_resolved` | `lot_id, share_id?, kind, to, amount` | `#[private]` (self) | — | Callback; see §1.4. `payout_claimed{ok, share_id}`. |
| `nft_transfer` / `nft_transfer_call` | NEP-171 | owner or approved account | 1 yocto | Guarded by `assert_transferable` (see `NFT-CONTROL.md`). Approvals are cleared on every transfer. |
| `nft_approve` / `nft_revoke` / `nft_revoke_all` | NEP-178 | owner | storage / 1 yocto | Standard. |

Claims return `true` when the pUSDC transfer succeeded and `false` when it failed and the claim was restored.

### 1.3 Settlement math

All amounts are pUSDC base units (6 decimals); kg are whole kilograms.

```text
escrow    = Σ kgᵢ × price_per_kg = sold_kg × price  (kg purchases; checked multiplication)
delivered = min(actual_kg, sold_kg)                  (over-delivery is not paid: only sold kg are escrowed)
gross     = delivered × price_per_kg
fee       = floor(gross × fee_bps / 10_000)          (fee_bps frozen on the lot at the first sale)
farmer    = gross − fee
pool      = escrow − gross                           (refund pool, snapshotted on the lot)
shareᵢ    = floor(pool × kgᵢ / sold_kg)              (per share NFT, at settlement AND claim time)
holder    = Σ shareᵢ
treasury  = fee + (pool − holder)                    (rounding dust joins the fee)
farmer + treasury + holder == escrow                 (always; tested)
```

Rounding: the fee and each share entitlement floor; the per-share dust is swept into the treasury claim at settlement, so no base unit is left in the contract and the parts always sum to the escrow.

Reference example (`fee_bps = 200`, 2 %), tested in `src/test.rs` and `tests/refunds.rs`:

| Step | Value | Base units |
| --- | --- | --- |
| Projection × price | 1,000 kg × 0.45 pUSDC | `projected_kg = 1000`, `price_per_kg = "450000"` |
| Purchases | buyer1 700 kg + investor2 300 kg (sold out) | `sold_kg = 1000`, `share_count = 2`, shares `lot-1:1`/`lot-1:2` |
| Escrow | 450.00 pUSDC | `escrow = "450000000"` (`funding_total` is the whole-harvest 450.00) |
| Weigh-in | 900 kg | `actual_kg = 900` |
| Gross | 900 × 0.45 = 405.00 | `405000000` |
| Fee 2 % | 8.10 | `8100000` |
| **Farmer** | 405.00 − 8.10 = **396.90** | `396900000` |
| **Treasury** | **8.10** | `8100000` |
| **Holder pool** (under-delivery refund) | 450.00 − 405.00 = **45.00** | `holder_pool = "45000000"` |
| **Share 700 kg** (lot-1:1) | floor(45.00 × 700 / 1000) = **31.50** | `31500000` |
| **Share 300 kg** (lot-1:2) | floor(45.00 × 300 / 1000) = **13.50** | `13500000` |

Crop failure: `pool = escrow` (450.00), split pro-rata the same way (dust to treasury). Partially-funded lots (closed early by `close_funding`) settle identically with `sold_kg < projected_kg`: the unsold kg has no escrow behind it.

### 1.4 Funding and claims (cross-contract flow)

Funding is one call on **pUSDC** (the buyer signs it):

```bash
near contract call-function as-transaction pusdc.pratala.testnet ft_transfer_call \
  json-args '{"receiver_id":"lots.pratala.testnet","amount":"315000000","msg":"{\"action\":\"fund\",\"lot_id\":\"lot-1\",\"kg\":700}"}' \
  prepaid-gas '100 Tgas' attached-deposit '1 yoctoNEAR' \
  sign-as buyer.testnet network-config testnet sign-with-plaintext-private-key '<buyer key from config/keys>' send
```

`ft_on_transfer` checks, in order: predecessor is the configured pUSDC, not paused, msg parses as exactly `{"action":"fund","lot_id":"…","kg":K}`, `kg > 0` and ≤ `remaining_kg`, the share cap is not reached (≤ 64 per lot), the lot exists and is Listed, sender ≠ farmer, `amount ≥ kg × price_per_kg`. Any failure panics, and pUSDC's `ft_resolve_transfer` returns the full amount to the sender. On success it adds `kg` to `sold_kg` and `kg × price` to `escrow`, freezes `fee_bps` at the first sale (and stamps `funded_at_ms`), mints the buyer a share NFT `"{lot_id}:{n}"` (contract-paid storage from the registration reserve; `internal_mint_with_refund` with no refund account, mint event emitted by our code — verified in near-contract-standards 5.30.1 `core_impl.rs`), closes funding automatically when sold out, and returns `amount − cost`, which pUSDC refunds. The lot certificate never moves on funding.

Claims are pulled, one per lot at a time:

1. Checks: ≥ 40 Tgas attached, status Settled or Refunded, `claim_lock == false`, caller authorised, claim > 0.
2. State **before** the external call: the claim is set to 0 and `claim_lock = true`.
3. `pusdc.ft_transfer(to, amount, memo "pratala:<lot_id>:<farmer|holder|treasury>")` with 1 yocto and 15 Tgas, then `on_claim_resolved` with 10 Tgas.
4. `on_claim_resolved` (`#[private]`, `#[callback_result]`, never panics): clears `claim_lock`; on success `escrow −= amount` (and `farmer_paid += amount` for farmer claims); on failure restores the claim. Emits `payout_claimed{lot_id, kind, to, amount, ok}`.

A payout fails when the recipient is not storage-registered on pUSDC. Nothing is lost: the claim comes back and can be pulled again after `storage_deposit`.

### 1.5 Validation and bounds

| Input | Rule |
| --- | --- |
| `crop`, `region`, `grade`, `reason` | non-empty, ≤ 256 bytes |
| `variety`, `media_uri`, `reference`, `evidence_uri`, `note` | ≤ 256 bytes when present |
| `plot_hash`, `gps_hash`, `evidence_hash`, `ai_check_hash` | 64 lowercase hex characters (sha256) |
| `harvest_month` | `YYYY-MM`, month 01–12 |
| `projected_kg`, `price_per_kg` | > 0; their product must fit in u128 |
| Attestations | ≤ 8 per lot (the state machine itself produces at most 3) |
| List views | ≤ 100 items; `get_lots*` default 50 |

### 1.6 Pause

`set_paused(true)` blocks: `register_lot`, `attest_field`, `attest_coop`, `list_lot`, `update_price`, funding (`ft_on_transfer`, full refund), `weigh_in`. It does **not** block claims, `delist_lot`, `cancel_lot`, `declare_failure` or NFT transfers, so money can always leave the contract.

### 1.7 Views

`get_lot(lot_id) → LotView | null`, `get_lots(from_index?, limit?)`, `get_lots_by_status(status, from_index?, limit?)`, `get_lots_by_farmer(account_id)`, `get_attestations(lot_id)`, `get_claims(lot_id)`, `quote_funding(lot_id) → U128` (cost of the remaining kg), `quote_purchase(lot_id, kg) → U128`, `get_share(share_id) → ShareView | null`, `get_shares(lot_id) → ShareView[]` (mint order), `get_roles(account_id)` (`["Admin"]` for the owner plus stored roles), `list_role(role)`, `get_config()`, `get_stats()`, and the NEP-171/177/178/181 views (`nft_token`, `nft_tokens`, `nft_tokens_for_owner`, `nft_supply_for_owner`, `nft_total_supply`, `nft_is_approved`, `nft_metadata`). A holder's shares are found with `nft_tokens_for_owner` (ids `lot-N:M`) + `get_share`.

`LotView` carries `sold_kg` / `remaining_kg` / `share_count` and the settlement `holder_pool` snapshot; share owners live only in the NFT `owner_by_id` map, read at query time, never cached. `LotView.funding_total` is `projected_kg × price_per_kg` (the whole harvest).

Stats: `total_lots` = registered lots; `verified_lots` = lots that reached CoopVerified; `funded_lots` = lots that closed funding (sold out or early); `settled_lots` = weigh-ins; `settled_volume` = Σ gross at weigh-in; `farmer_paid` = Σ successful farmer claims.

```bash
near contract call-function as-read-only lots.pratala.testnet get_lot json-args '{"lot_id":"lot-1"}' network-config testnet now
near contract call-function as-read-only lots.pratala.testnet get_claims json-args '{"lot_id":"lot-1"}' network-config testnet now
```

### 1.8 Events

NEP-297 logs `EVENT_JSON:{"standard":"pratala","version":"1.0.0","event":"<name>","data":[{...}]}`:

| Event | Data | Emitted by |
| --- | --- | --- |
| `lot_registered` | `lot_id, farmer_id, crop, projected_kg, harvest_month` | `register_lot` |
| `lot_attested` | `lot_id, kind, signer, evidence_hash, ai_check_hash` | `attest_field`, `attest_coop`, `weigh_in`, `declare_failure` |
| `lot_listed` | `lot_id, price_per_kg, total` | `list_lot`, `update_price` |
| `lot_delisted` / `lot_cancelled` | `lot_id` | `delist_lot` / `cancel_lot` |
| `lot_funded` | `lot_id, buyer, kg, amount, refund, sold_kg, share_id` | `ft_on_transfer` |
| `lot_funding_closed` | `lot_id, sold_kg, projected_kg, closed_by` | sell-out in `ft_on_transfer`, or `close_funding` |
| `lot_settled` | `lot_id, actual_kg, grade, sold_kg, farmer_claim, holder_pool, fee` (fee incl. dust) | `weigh_in` |
| `lot_refunded` | `lot_id, reason, holder_pool` | `declare_failure` |
| `payout_claimed` | `lot_id, share_id (null except holder claims), kind, to, amount, ok` | `on_claim_resolved` |
| `role_changed` | `role, account_id, added` | `add_role`, `remove_role` (only when changed) |

Standard events also appear: `nep171` `nft_mint` (register and every share purchase) and `nft_transfer` (every transfer); `nep141` `ft_transfer` / `ft_mint` from pUSDC.

### 1.9 Storage model

| Collection | Type | Prefix (`StorageKey`) | Paid by |
| --- | --- | --- | --- |
| NFT owner, token metadata, per-owner index, approvals | `NonFungibleToken` (legacy `collections`) | `NftOwnerById`, `NftTokenMetadata`, `NftEnumeration`, `NftApproval` | farmer at `register_lot` (mint), approver (`nft_approve`) |
| Collection metadata | `LazyOption<NFTContractMetadata>` | `NftMetadata` | deployer |
| Lots | `store::IterableMap<TokenId, Lot>` (Borsh) | `Lots` | farmer at `register_lot` |
| Role allowlists | `store::IterableSet<AccountId>` ×3 | `FieldAgents`, `Coops`, `Warehouses` | owner (contract balance) |

`register_lot` measures the storage the lot and its certificate token add, adds a fixed reserve of 48,000 bytes (≈ 0.48 NEAR at 10¹⁹ yocto/byte) and requires the attached deposit to cover it; the excess is refunded in the same transaction. The reserve pays for what the lot gains later from non-payable calls: ≤ 3 bounded attestations, settlement fields, and up to `MAX_SHARES_PER_LOT` (64) share NFTs minted by purchases (contract-paid, since `ft_on_transfer` carries no deposit). Attach 0.6 NEAR; ≈ 0.49 NEAR is kept for a typical lot (measured lot bytes + 48,000 reserve; pinned below 0.6 NEAR by the unit test `registration_storage_cost_fits_in_0_6_near`). At the share cap further purchases are rejected with a clear error until the farmer closes funding. The deployer must keep a small NEAR balance on the contract account for its own code and state.

`StorageKey` variants are append-only. The contract has no upgrade or migration method; redeploying requires the account's full-access key.

## 2. `pusdc`

Test stablecoin forked from `near-examples/FT`. It has no value.

| Method | Args | Caller | Deposit | Notes |
| --- | --- | --- | --- | --- |
| `new` | `owner_id, total_supply, metadata` | init | — | Registers the owner and mints `total_supply` to it (`ft_mint` if > 0). |
| `faucet` | `amount` (U128) | any **registered** account | 0 | `0 < amount ≤ "10000000000"` (10,000 pUSDC). Emits `ft_mint`. Returns the new balance. |
| `mint` | `account_id, amount` | owner | 0 | Uncapped; recipient must be registered. |
| `ft_transfer` / `ft_transfer_call` | NEP-141 | holder | 1 yocto | Standard. |
| `storage_deposit` / `storage_withdraw` / `storage_unregister` | NEP-145 | anyone | `storage_balance_bounds.min` (≈ 0.00125 NEAR) | Standard. |
| Views | `ft_balance_of`, `ft_total_supply`, `ft_metadata`, `storage_balance_of`, `storage_balance_bounds`, `get_owner` | — | — | |

Faucet in one transaction (two actions): `storage_deposit {}` with the min bound attached (skip if already registered), then `faucet {"amount":"1000000000"}`.

## 3. Tests

| Where | What |
| --- | --- |
| `contracts/pusdc/src/test.rs` | 9 unit tests: init, faucet cap / zero / unregistered, owner mint, transfer. |
| `contracts/harvest-lot/src/test.rs` | 51 unit tests: registration storage cost, settlement math (full, 900/1000, over-delivery cap, zero delivery, rounding, fee 0 / 1000), fee frozen at funding, validation, state machine, roles, msg parsing, funding errors, transfer guard, claim lock + callback restore. |
| `tests/happy_path.rs` | Two buyers split the harvest (700 + 300 kg), balances prove the 396.90 + 8.10 + 31.50 + 13.50 pro-rata split; partial close settles the sold kg only; excess payment refunded. |
| `tests/refunds.rs` | 396.90 / 8.10 split with per-share 45.00 refund; crop failure refund pro-rata; zero-kg / over-remaining / under / malformed / self funding refunded in full. |
| `tests/transfer.rs` | Refund follows the share NFT on resale; failed payout restores the claim and unmarks the share; mid-payout share transfer rejected in one receipt; lot certificate stays with the farmer until funding closes; cancelled lots frozen. |
| `tests/access.rs` | Role checks, coop ≠ field signer, owner-only admin, pause; faucet cap and registration. |
