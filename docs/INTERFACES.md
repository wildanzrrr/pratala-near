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
| Ports | web `3000`, api `4100`, postgres `5432` (external, not in compose) | — |

Ids may fall back to other names if taken; `deploy/testnet.json` is authoritative after deploy. Never hard-code ids outside env/config.

## 2. JSON conventions

- `U128` amounts are **strings** of base units (`"450000000"` = 450 pUSDC). `u64` counts and `*_ms` timestamps are JSON numbers.
- Enums serialize as their variant name string: `"Registered"`, `"FieldAgent"`.
- `AccountId` is a string. Optional fields are `null` when absent.

## 3. `harvest-lot` contract

Lots are sold **by the kilogram**: a listing at `price_per_kg` stays open (`Listed`) while
unsold kg remain, each purchase mints a **share NFT** (`"{lot_id}:{n}"`) to the buyer for the
kg bought, and the lot certificate NFT stays with the farmer. Selling out — or the farmer's
`close_funding` with partial escrow — moves the lot to `Funded`.

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
  lot_id: string;                   // "lot-1", also the certificate NFT token_id
  farmer_id: string; crop: string; variety: string | null; region: string;
  projected_kg: number; harvest_month: string;      // "YYYY-MM"
  plot_hash: string; gps_hash: string; area_m2: number | null;
  price_per_kg: string;             // U128, pUSDC base units per kg; "0" until listed
  status: Status; attestations: Attestation[];
  sold_kg: number; remaining_kg: number; share_count: number;
  escrow: string; funded_at_ms: number | null;     // first purchase time
  actual_kg: number | null; grade: string | null; settled_at_ms: number | null;
  fee_bps: number;                  // fee rate frozen at the first sale (0 before)
  claims: Claims; claim_lock: boolean; created_at_ms: number;
  funding_total: string;            // projected_kg * price_per_kg (whole harvest)
  holder_pool: string;              // U128 refund pool snapshotted at settlement; "0" before
}
interface ShareView {
  share_id: string;                 // "lot-1:1" — the share NFT token_id
  lot_id: string; kg: number; owner: string; claimed: boolean;
  entitlement: string;              // U128 refund entitlement after settle/refund; "0" before
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
| `register_lot` | `crop, variety?, region, projected_kg, harvest_month, plot_hash, gps_hash, area_m2?, media_uri?, reference?` | anyone → becomes farmer | **0.3 NEAR** (charges storage + 20,000-byte reserve that also pre-pays share mints, ≈ 0.21 NEAR, excess refunded) / 50 Tgas | → Registered, certificate NFT minted to caller; returns `lot_id` |
| `attest_field` | `lot_id, evidence_hash, evidence_uri?, gps_hash, ai_check_hash?, note?` | FieldAgent | **0** (contract pays storage) / 30 Tgas | Registered → FieldVerified |
| `attest_coop` | `lot_id, evidence_hash, evidence_uri?, note?` | Coop, ≠ field signer | 0 / 30 Tgas | FieldVerified → CoopVerified |
| `list_lot` / `update_price` | `lot_id, price_per_kg` | farmer | 0 | CoopVerified → Listed / Listed; both require `sold_kg == 0` |
| `delist_lot` | `lot_id` | farmer | 0 | Listed → CoopVerified; requires `sold_kg == 0` |
| `close_funding` | `lot_id` | farmer or owner | 0 | Listed → Funded with partial escrow; requires `sold_kg > 0`; not blocked by pause |
| `cancel_lot` | `lot_id` | farmer or owner | 0 | Registered/FieldVerified/CoopVerified → Cancelled; requires `sold_kg == 0` |
| `weigh_in` | `lot_id, actual_kg, grade, evidence_hash, evidence_uri?, ai_check_hash?` | Warehouse | 0 / 30 Tgas | Funded → Settled |
| `declare_failure` | `lot_id, reason, evidence_hash` | Coop or owner | 0 | Funded → Refunded |
| `claim_payout` / `claim_refund` / `claim_fee` | `lot_id` / **`share_id`** / `lot_id` | farmer / **share NFT owner** / owner or treasury | **0** / 60 Tgas (min 40) | pays out its claim via pUSDC `ft_transfer`; `claim_refund` pays that share's entitlement exactly once; returns `true` if paid, `false` if the transfer failed (claim restored) |
| `nft_transfer` / `nft_transfer_call` (NEP-171) | `receiver_id, token_id, approval_id?, memo?` (+ `msg`) | holder or approved account | **1 yocto** | **share NFTs** (`lot-N:M`): transferable any time the lot's `claim_lock` is false. **Lot certificate** (`lot-N`): only when status is Funded / Settled / Refunded and `claim_lock` is false (before funding it stays with the farmer) |

Function-call-key friendly (no deposit): `attest_field, attest_coop, weigh_in, declare_failure, list_lot, update_price, delist_lot, close_funding, cancel_lot, claim_payout, claim_refund, claim_fee`.

**Buying kg** is a call on the **pUSDC** contract, not the lots contract:

```json
// receiver: PUSDC_CONTRACT_ID · method: ft_transfer_call · deposit: "1" · gas: 100 Tgas
{ "receiver_id": "<LOTS_CONTRACT_ID>", "amount": "<kg × price_per_kg>",
  "msg": "{\"action\":\"fund\",\"lot_id\":\"lot-1\",\"kg\":300}" }
```

`kg` is a positive integer ≤ `remaining_kg`; amount ≥ `kg × price_per_kg` required (excess refunded, invalid msg/state ⇒ full refund). Each purchase mints the buyer a share NFT `"{lot_id}:{n}"` titled `"{kg} kg of {crop} · {lot_id}"` (≤ 32 shares per lot; at the cap buyers wait for `close_funding`). Selling out flips the lot to Funded automatically.

**Settlement math** (weigh-in): `delivered = min(actual_kg, sold_kg)`, `gross = delivered × price_per_kg`, `fee = gross × fee_bps / 10000`, `holder_pool = escrow − gross`, each share's entitlement = `floor(holder_pool × kg / sold_kg)`, `claims.holder = Σ entitlements`, `claims.treasury = fee + dust` where `dust = holder_pool − Σ entitlements`. Crop failure: `holder_pool = escrow`, same split. Reference numbers: 1,000 kg sold (700 + 300) × 0.45 = 450 escrow; 900 kg at 200 bps → farmer 396.90, treasury 8.10, pool 45.00 → the 700 kg share claims 31.50, the 300 kg share 13.50.

`fee_bps` is frozen per lot at the first sale. `set_paused(true)` blocks `register_lot`, attestations, `list_lot`/`update_price`, purchases and `weigh_in`; claims, `delist_lot`, `cancel_lot`, `close_funding`, `declare_failure` and NFT transfers stay open. `update_price` re-emits `lot_listed`. Stats: `verified_lots` = lots that reached CoopVerified, `funded_lots` = lots that closed funding (sold out or early), `settled_lots` = weigh-ins, `settled_volume` = Σ gross (delivered × price) at weigh-in, `farmer_paid` = Σ successful farmer claims.

### View methods

`get_lot(lot_id) → LotView | null` · `get_lots(from_index?: number, limit?: number) → LotView[]` · `get_lots_by_status(status, from_index?, limit?)` · `get_lots_by_farmer(account_id)` · `get_attestations(lot_id)` · `get_claims(lot_id) → Claims` · `quote_funding(lot_id) → string` (cost of the remaining kg) · `quote_purchase(lot_id, kg) → string` · `get_share(share_id) → ShareView | null` · `get_shares(lot_id) → ShareView[]` · `get_roles(account_id) → Role[]` · `list_role(role) → string[]` · `get_config() → Config` · `get_stats() → Stats` · NEP-171/177/181: `nft_token`, `nft_tokens`, `nft_tokens_for_owner`, `nft_supply_for_owner`, `nft_metadata` (a holder's shares are found with `nft_tokens_for_owner` + `get_share`). List views return at most 100 items (default 50 for `get_lots*`).

### Events (NEP-297, `EVENT_JSON:` log prefix)

`{"standard":"pratala","version":"1.0.0","event":"<name>","data":[{...}]}` — each `data` item:

| event | data fields |
| --- | --- |
| `lot_registered` | `lot_id, farmer_id, crop, projected_kg, harvest_month` |
| `lot_attested` | `lot_id, kind, signer, evidence_hash, ai_check_hash` |
| `lot_listed` | `lot_id, price_per_kg, total` |
| `lot_delisted` / `lot_cancelled` | `lot_id` |
| `lot_funded` | `lot_id, buyer, kg, amount, refund, sold_kg, share_id` |
| `lot_funding_closed` | `lot_id, sold_kg, projected_kg, closed_by` (sell-out or `close_funding`) |
| `lot_settled` | `lot_id, actual_kg, grade, sold_kg, farmer_claim, holder_pool, fee` (fee includes the rounding dust) |
| `lot_refunded` | `lot_id, reason, holder_pool` |
| `payout_claimed` | `lot_id, share_id (null except holder claims), kind, to, amount, ok` |
| `role_changed` | `role, account_id, added` |

Standard `nep171` `nft_mint` (lot certificate and every share) / `nft_transfer` and `nep141` `ft_mint` / `ft_transfer` events are also emitted.

## 4. `pusdc` contract (NEP-141 + NEP-145)

`new(owner_id, total_supply, metadata)` with `{spec:"ft-1.0.0", name:"Pratala Test USDC", symbol:"pUSDC", decimals:6}` · standard `ft_transfer` (1 yocto), `ft_transfer_call` (1 yocto), `ft_balance_of`, `ft_total_supply`, `ft_metadata`, `storage_deposit` (attach `storage_balance_bounds.min`, ≈ 0.00125 NEAR), `storage_balance_of`, `storage_balance_bounds` · `faucet(amount)` — caller must be registered, `amount ≤ "10000000000"` (10,000 pUSDC) · `mint(account_id, amount)` owner only.

Faucet UI = one transaction to pUSDC with two actions: `storage_deposit {}` (if not registered) + `faucet {amount:"1000000000"}`.

## 5. Backend HTTP API (`/api`, JSON, httpOnly cookie `pratala_session`)

| Method + path | Body / query | Response |
| --- | --- | --- |
| `GET /health` | — | `{ ok, db, chain:{ rpc, lotsContract, pusdcContract }, ai:{ configured, model } }` |
| `POST /auth/challenge` | `{ accountId }` | `{ nonce (base64, 32 bytes), message, recipient, expiresAt }` |
| `POST /auth/verify` | `{ accountId, publicKey, signature (base64), nonce }` | `{ accountId }` + cookie |
| `POST /auth/verify-sso` | `{ accountId, publicKey, token (Auth0 JWT) }` | `{ accountId }` + cookie — NEAR Auth binding: JWT verified via JWKS, `derived_public_key` must equal `publicKey` and be a full-access key on-chain |
| `POST /fastauth/resolve-account` | `{ token }` | `{ accountId: string \| null, publicKey }` — which sponsored account this login already owns (null ⇒ first visit, name not chosen yet) |
| `POST /fastauth/create-account` | `{ accountId, publicKey, token }` | `{ accountId, txHash, seedNear }` — the user-chosen `<name>.<sponsor>` id (400 `invalid_account_name` otherwise); sponsor pays `CreateAccount + AddKey + Transfer(seed)`; one seed per login and per account (409 `account_exists` / `already_sponsored`, 503 `sponsor_unconfigured`) |
| `POST /fastauth/sign-tx` | `{ guard_id, verify_payload, sign_payload, algorithm? }` (NEAR Auth relayer protocol) | `{ hash, result }` — relays the `sign` call to the fast-auth contract (sponsor pays gas) |
| `POST /auth/logout` · `GET /auth/me` | — | `{ accountId, roles: Role[], profile }` |
| `GET/PUT /users/me` · `GET /users/:accountId` | `{ displayName, region, locale?: "en", phone?, intent: "farmer"|"buyer"|"verifier"|"supplier" }` | profile |
| `POST /plots` · `GET /plots/mine` · `GET /plots/:id` | `{ name, lat, lng, areaM2, region, evidenceIds[] }` | `{ id, ..., plotHash, gpsHash }` |
| `POST /evidence` (multipart `file`, `kind`, `lotId?`, `plotId?`) | image ≤ 8 MB | `{ id, sha256, uri, mime, lat, lng, capturedAt, kind }` |
| `GET /evidence/:sha256` | — | file stream |
| `POST /ai/check` | `{ evidenceId, kind: "FIELD_VISIT"|"COOP_REVIEW"|"WEIGH_IN"|"PLOT", expectedCrop?, plotLat?, plotLng? }` | `AiCheck` below |
| `GET /ai/check/:id` | — | `AiCheck` |
| `GET /lots` | `?status&crop&region&q&farmer` | `LotView[]` (mirror) |
| `GET /lots/:lotId` · `/lots/:lotId/history` · `/lots/:lotId/metadata.json` | — | `LotView & { evidence[], aiChecks[] }` · `LotEvent[]` · NEP-177 reference JSON |
| `POST /tx` | `{ txHash, signerId, context?: { lotId?, orderId? } }` | `{ ok, events: LotEvent[] }` |
| `GET /payments` · `GET /payments/export.csv` | `?account&lotId&from&to` | `Payment[]` · CSV |
| `GET /notifications` · `POST /notifications/:id/read` | — | `Notification[]` |
| `GET /listings` · `POST /listings` · `PUT /listings/:id` | `{ title, category: "SEED"|"FERTILIZER"|"SOIL"|"OTHER", description, priceUsdc, unit, stock, region }` | `InputListing` |
| `POST /orders` · `POST /orders/:id/confirm` · `GET /orders/mine` | `{ listingId, qty }` · `{ txHash }` | `{ id, memo, amount, sellerId, status }` |
| `GET /intents/tokens` · `POST /intents/quote` · `POST /intents/deposit/submit` · `GET /intents/status` | as prototype `server.mjs`, `dry` defaults `true` | 1Click passthrough |
| `GET /stats` | — | `Stats` + `{ farmers, verifiers }` |

```ts
interface AiCheck { id: string; evidenceId: string; kind: string; model: string; tier: "private-tee" | "anonymised" | "unknown";
  provider: "near-ai-cloud"; chatId: string | null;
  verdict: "pass" | "review" | "fail"; confidence: number; findings: string[];
  extracted: { crop?: string; stage?: string; kg?: number; grade?: string };
  summaryEn: string /* single English summary */; responseHash: string; requestHash: string | null;
  signatureAvailable: boolean; signature: { text; signature; signing_address; signing_algo; signature_kind? } | null;
  verifyUrl: string /* https://cloud.near.ai/verify?model=<id>#receipt=<base64url> */; createdAt: string }
interface LotEvent { id: string; lotId: string | null; event: string; data: object; txHash: string; signerId: string; blockTimestamp: string
  /* history only: */ receiptId?: string; explorerUrl?: string | null }
interface Payment { id: string; lotId: string | null; orderId: string | null; type: "FUNDING"|"PAYOUT"|"REFUND"|"FEE"|"INPUT_PURCHASE";
  fromAccount: string; toAccount: string; amount: string /* decimal pUSDC, e.g. "396.90" */; status: "PENDING"|"PAID"|"REFUNDED"|"FAILED";
  txHash: string | null; explorerUrl: string | null; createdAt: string }
```

CSV columns: `date_utc,lot_id,crop,type,from_account,to_account,amount_pusdc,status,tx_hash,explorer_url,note` (UTF-8 BOM, CRLF).

### 5.1 Backend implementation notes (additive to the table above)

- **Errors** are JSON `{ statusCode, error, message?, issues? }`. `error` is a stable code where one exists (`ai_unavailable`, `ai_upstream_error`, `chain_unavailable`, `tx_not_found`, `transfer_mismatch`), otherwise the human message (intents keeps the prototype's `{error:"<message>"}` texts). Validation failures: 400 with `issues[]`.
- **`POST /intents/quote`**: `recipient` must be a mainnet NEAR account — `*.testnet`/`*.betanet` recipients get a 400 before the 1Click call. A 1Click rejection whose body is its generic `"Internal server error"` is rewrapped into an actionable message carrying the provider `correlationId`.
- **`GET /health`**: `chain` = `{ network, rpc: "ok"|"unreachable", lotsContract|pusdcContract: "ok"|"missing"|"unknown", lotsContractId, pusdcContractId }`, `ai` adds `tier`, plus `time`. HTTP 503 when `db` is `"down"`.
- **Amounts in API responses** are decimal pUSDC strings with at least 2 dp and no lossy rounding (`"396.90"`, `"0.000001"`); `Payment`, `Order` and `InputListing` also carry the exact `amountBase` / `priceBase` (U128 string). `Payment` adds `note` and `occurredAt` (block time of the last status change; CSV `date_utc` uses it, format `YYYY-MM-DD HH:MM:SS` UTC).
- **Plots**: `plotHash = sha256(canonical JSON {"areaM2":int,"evidence":[sorted lowercase sha256],"farmer","lat":"5dp","lng":"5dp"})`, `gpsHash = sha256("<lat 5dp>,<lng 5dp>")`. Non-owners get `lat/lng` rounded to 0.01° (`coordinatesPrecision`). Plot responses carry both `evidenceIds[]` and the full `evidence[]`.
- **Orders**: response adds `transfer: { receiverId: PUSDC_CONTRACT_ID, methodName: "ft_transfer", args: { receiver_id, amount, memo }, deposit: "1", gas }` (what the wallet signs) and `explorerUrl`. `POST /tx` with `context.orderId` also confirms the order and returns `order`.
- **Listings**: `priceUsdc` is accepted as a decimal string/number and returned as a decimal string.
- **Stats** adds `source: "chain" | "mirror"`.
- `POST /auth/logout` returns `{ ok: true }`. `GET /notifications?unread=true` filters unread; items are `{ id, accountId, type, kind (= type), lotId, title, body, data, read, readAt, createdAt }` (English copy).
- **Language**: the UI and all API copy (notifications, AI summaries, seed data) are English-only. `locale` is always `"en"`; `PUT /users/me` still accepts a legacy `"id"` and stores `"en"`.

The frontend reads **chain state directly via RPC** and uses the API only for off-chain data (evidence, AI checks, history, payments, notifications, profiles). Every page must still render if the API is down.
