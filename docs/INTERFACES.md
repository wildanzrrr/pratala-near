# Interfaces — the contract between workstreams

> Source of truth shared by `smart-contract/`, `backend/`, `frontend/` and `scripts/`. If you must change anything here, change this file in the same commit and say so in the commit body.

## 1. Accounts and constants

| Name | Testnet value | Env var |
| --- | --- | --- |
| Lots contract (`harvest-lot`) | `lots.pratala.testnet` | `LOTS_CONTRACT_ID` / `NEXT_PUBLIC_LOTS_CONTRACT_ID` |
| Stablecoin (`pusdc`) | `pusdc.pratala.testnet` | `PUSDC_CONTRACT_ID` / `NEXT_PUBLIC_PUSDC_CONTRACT_ID` |
| Root / owner / treasury | `pratala.testnet` | — |
| RPC | `https://test.rpc.fastnear.com` | `NEAR_RPC_URL` / `NEXT_PUBLIC_RPC_URL` |
| Explorer tx URL | `https://testnet.nearblocks.io/txns/<hash>` | `EXPLORER_BASE` |
| pUSDC decimals | `6` (1 pUSDC = `"1000000"`) | — |
| Ports | web `3000`, api `4000`, postgres host `5433` | — |

Ids may fall back to other names if taken; `deploy/testnet.json` is authoritative after deploy. Never hard-code ids outside env/config.

## 2. JSON conventions

- `U128` amounts are **strings** of base units (`"450000000"` = 450 pUSDC). `u64` counts and `*_ms` timestamps are JSON numbers.
- Enums serialize as their variant name string: `"Registered"`, `"FieldAgent"`.
- `AccountId` is a string. Optional fields are `null` when absent.

## 3. `harvest-lot` contract

### Types

```ts
type Status = "Registered" | "FieldVerified" | "CoopVerified" | "Listed" | "Funded" | "Settled" | "Refunded" | "Cancelled";
type Role = "Admin" | "FieldAgent" | "Coop" | "Warehouse";          // "Admin" = contract owner (not stored as role)
type AttestationKind = "FieldVisit" | "CoopReview" | "WarehouseWeighIn" | "CropFailure";
type ClaimKind = "Farmer" | "Holder" | "Treasury";

interface Attestation {
  kind: AttestationKind; signer: string; timestamp_ms: number;
  evidence_hash: string;            // sha256 hex, 64 chars
  evidence_uri: string | null;      // e.g. https://api.../api/evidence/<sha256>
  ai_check_hash: string | null;     // sha256 hex of the stored NEAR AI response JSON
  note: string | null; actual_kg: number | null; grade: string | null; gps_hash: string | null;
}
interface Claims { farmer: string; holder: string; treasury: string }   // U128 strings, remaining unclaimed
interface LotView {
  lot_id: string;                   // "lot-1", also the NFT token_id
  farmer_id: string; crop: string; variety: string | null; region: string;
  projected_kg: number; harvest_month: string;      // "YYYY-MM"
  plot_hash: string; gps_hash: string; area_m2: number | null;
  price_per_kg: string;             // U128, pUSDC base units per kg; "0" until listed
  status: Status; attestations: Attestation[];
  escrow: string; funder: string | null; funded_at_ms: number | null;
  actual_kg: number | null; grade: string | null; settled_at_ms: number | null;
  claims: Claims; claim_lock: boolean; created_at_ms: number;
  holder: string;                   // current NFT owner
  funding_total: string;            // projected_kg * price_per_kg
}
interface Config { owner_id: string; usdc_contract: string; treasury: string; fee_bps: number; paused: boolean; total_lots: number }
interface Stats { total_lots: number; verified_lots: number; funded_lots: number; settled_lots: number; settled_volume: string; farmer_paid: string }
```

### Change methods

| Method | Args (JSON) | Caller | Deposit / gas | Transition |
| --- | --- | --- | --- | --- |
| `new` | `owner_id, usdc_contract, treasury, fee_bps` | init | — | — |
| `add_role` / `remove_role` | `role, account_id` | owner | 0 / 30 Tgas | — |
| `set_fee_bps` (≤ 1000) / `set_treasury` / `set_paused` | `fee_bps` / `account_id` / `paused` | owner | 0 | — |
| `register_lot` | `crop, variety?, region, projected_kg, harvest_month, plot_hash, gps_hash, area_m2?, media_uri?` | anyone → becomes farmer | **0.1 NEAR** (excess refunded) / 50 Tgas | → Registered, NFT minted to caller; returns `lot_id` |
| `attest_field` | `lot_id, evidence_hash, evidence_uri?, gps_hash, ai_check_hash?, note?` | FieldAgent | **0** (contract pays storage) / 30 Tgas | Registered → FieldVerified |
| `attest_coop` | `lot_id, evidence_hash, evidence_uri?, note?` | Coop, ≠ field signer | 0 / 30 Tgas | FieldVerified → CoopVerified |
| `list_lot` / `update_price` | `lot_id, price_per_kg` | farmer | 0 | CoopVerified → Listed / Listed |
| `delist_lot` | `lot_id` | farmer | 0 | Listed → CoopVerified |
| `cancel_lot` | `lot_id` | farmer or owner | 0 | Registered/FieldVerified/CoopVerified → Cancelled |
| `weigh_in` | `lot_id, actual_kg, grade, evidence_hash, evidence_uri?, ai_check_hash?` | Warehouse | 0 / 30 Tgas | Funded → Settled |
| `declare_failure` | `lot_id, reason, evidence_hash` | Coop or owner | 0 | Funded → Refunded |
| `claim_payout` / `claim_refund` / `claim_fee` | `lot_id` | farmer / **current NFT holder** / owner or treasury | **0** / 60 Tgas | pays out its claim via pUSDC `ft_transfer` |
| `nft_transfer` (NEP-171) | `receiver_id, token_id, approval_id?, memo?` | holder | **1 yocto** | blocked while `claim_lock` or Cancelled |

Function-call-key friendly (no deposit): `attest_field, attest_coop, weigh_in, declare_failure, list_lot, update_price, delist_lot, cancel_lot, claim_payout, claim_refund, claim_fee`.

**Funding** is a call on the **pUSDC** contract, not the lots contract:

```json
// receiver: PUSDC_CONTRACT_ID · method: ft_transfer_call · deposit: "1" · gas: 100 Tgas
{ "receiver_id": "<LOTS_CONTRACT_ID>", "amount": "<funding_total>", "msg": "{\"action\":\"fund\",\"lot_id\":\"lot-1\"}" }
```

Amount ≥ `funding_total` required; excess is refunded; invalid msg/state ⇒ full refund. On success the NFT moves farmer → buyer.

**Settlement math** (weigh-in): `delivered = min(actual_kg, projected_kg)`, `gross = delivered × price_per_kg`, `fee = gross × fee_bps / 10000`, `claims.farmer = gross − fee`, `claims.treasury = fee`, `claims.holder = escrow − gross`. Reference numbers: 1,000 kg × 0.45 pUSDC = 450 escrow; 900 kg at 200 bps → farmer 396.90, treasury 8.10, holder 45.00.

### View methods

`get_lot(lot_id) → LotView | null` · `get_lots(from_index?: number, limit?: number) → LotView[]` · `get_lots_by_status(status, from_index?, limit?)` · `get_lots_by_farmer(account_id)` · `get_lots_for_holder(account_id)` · `get_attestations(lot_id)` · `get_claims(lot_id) → Claims` · `quote_funding(lot_id) → string` · `get_roles(account_id) → Role[]` · `list_role(role) → string[]` · `get_config() → Config` · `get_stats() → Stats` · NEP-171/177/181: `nft_token`, `nft_tokens`, `nft_tokens_for_owner`, `nft_supply_for_owner`, `nft_metadata`.

### Events (NEP-297, `EVENT_JSON:` log prefix)

`{"standard":"pratala","version":"1.0.0","event":"<name>","data":[{...}]}` — each `data` item:

| event | data fields |
| --- | --- |
| `lot_registered` | `lot_id, farmer_id, crop, projected_kg, harvest_month` |
| `lot_attested` | `lot_id, kind, signer, evidence_hash, ai_check_hash` |
| `lot_listed` | `lot_id, price_per_kg, total` |
| `lot_delisted` / `lot_cancelled` | `lot_id` |
| `lot_funded` | `lot_id, funder, amount, refund` |
| `lot_settled` | `lot_id, actual_kg, grade, farmer_claim, holder_claim, fee` |
| `lot_refunded` | `lot_id, reason, holder_claim` |
| `payout_claimed` | `lot_id, kind, to, amount, ok` |
| `role_changed` | `role, account_id, added` |

Standard `nep171` `nft_mint` / `nft_transfer` and `nep141` `ft_mint` / `ft_transfer` events are also emitted.

## 4. `pusdc` contract (NEP-141 + NEP-145)

`new(owner_id, total_supply, metadata)` with `{spec:"ft-1.0.0", name:"Pratala Test USDC", symbol:"pUSDC", decimals:6}` · standard `ft_transfer` (1 yocto), `ft_transfer_call` (1 yocto), `ft_balance_of`, `ft_total_supply`, `ft_metadata`, `storage_deposit` (attach `storage_balance_bounds.min`, ≈ 0.00125 NEAR), `storage_balance_of`, `storage_balance_bounds` · `faucet(amount)` — caller must be registered, `amount ≤ "10000000000"` (10,000 pUSDC) · `mint(account_id, amount)` owner only.

Faucet UI = one transaction to pUSDC with two actions: `storage_deposit {}` (if not registered) + `faucet {amount:"1000000000"}`.

## 5. Backend HTTP API (`/api`, JSON, httpOnly cookie `pratala_session`)

| Method + path | Body / query | Response |
| --- | --- | --- |
| `GET /health` | — | `{ ok, db, chain:{ rpc, lotsContract, pusdcContract }, ai:{ configured, model } }` |
| `POST /auth/challenge` | `{ accountId }` | `{ nonce (base64, 32 bytes), message, recipient, expiresAt }` |
| `POST /auth/verify` | `{ accountId, publicKey, signature (base64), nonce }` | `{ accountId }` + cookie |
| `POST /auth/logout` · `GET /auth/me` | — | `{ accountId, roles: Role[], profile }` |
| `GET/PUT /users/me` · `GET /users/:accountId` | `{ displayName, region, locale: "id"|"en", phone?, intent: "farmer"|"buyer"|"verifier"|"supplier" }` | profile |
| `POST /plots` · `GET /plots/mine` · `GET /plots/:id` | `{ name, lat, lng, areaM2, region, evidenceIds[] }` | `{ id, ..., plotHash, gpsHash }` |
| `POST /evidence` (multipart `file`, `kind`, `lotId?`, `plotId?`) | image ≤ 8 MB | `{ id, sha256, uri, mime, lat, lng, capturedAt, kind }` |
| `GET /evidence/:sha256` | — | file stream |
| `POST /ai/check` | `{ evidenceId, kind: "FIELD_VISIT"|"COOP_REVIEW"|"WEIGH_IN"|"PLOT", expectedCrop?, plotLat?, plotLng? }` | `AiCheck` below |
| `GET /ai/check/:id` | — | `AiCheck` |
| `GET /lots` | `?status&crop&region&q&holder&farmer` | `LotView[]` (mirror) |
| `GET /lots/:lotId` · `/lots/:lotId/history` · `/lots/:lotId/metadata.json` | — | `LotView & { evidence[], aiChecks[] }` · `LotEvent[]` · NEP-177 reference JSON |
| `POST /tx` | `{ txHash, signerId, context?: { lotId?, orderId? } }` | `{ ok, events: LotEvent[] }` |
| `GET /payments` · `GET /payments/export.csv` | `?account&lotId&from&to` | `Payment[]` · CSV |
| `GET /notifications` · `POST /notifications/:id/read` | — | `Notification[]` |
| `GET /listings` · `POST /listings` · `PUT /listings/:id` | `{ title, category: "SEED"|"FERTILIZER"|"SOIL"|"OTHER", description, priceUsdc, unit, stock, region }` | `InputListing` |
| `POST /orders` · `POST /orders/:id/confirm` · `GET /orders/mine` | `{ listingId, qty }` · `{ txHash }` | `{ id, memo, amount, sellerId, status }` |
| `GET /intents/tokens` · `POST /intents/quote` · `POST /intents/deposit/submit` · `GET /intents/status` | as prototype `server.mjs`, `dry` defaults `true` | 1Click passthrough |
| `GET /stats` | — | `Stats` + `{ farmers, verifiers }` |

```ts
interface AiCheck { id: string; evidenceId: string; model: string; provider: "near-ai-cloud"; chatId: string | null;
  verdict: "pass" | "review" | "fail"; confidence: number; findings: string[];
  extracted: { crop?: string; stage?: string; kg?: number; grade?: string };
  summaryId: string; summaryEn: string; responseHash: string; signatureAvailable: boolean; verifyUrl: string; createdAt: string }
interface LotEvent { id: string; lotId: string | null; event: string; data: object; txHash: string; signerId: string; blockTimestamp: string }
interface Payment { id: string; lotId: string | null; orderId: string | null; type: "FUNDING"|"PAYOUT"|"REFUND"|"FEE"|"INPUT_PURCHASE";
  fromAccount: string; toAccount: string; amount: string /* decimal pUSDC, e.g. "396.90" */; status: "PENDING"|"PAID"|"REFUNDED"|"FAILED";
  txHash: string | null; explorerUrl: string | null; createdAt: string }
```

CSV columns: `date_utc,lot_id,crop,type,from_account,to_account,amount_pusdc,status,tx_hash,explorer_url,note` (UTF-8 BOM, CRLF).

The frontend reads **chain state directly via RPC** and uses the API only for off-chain data (evidence, AI checks, history, payments, notifications, profiles). Every page must still render if the API is down.
