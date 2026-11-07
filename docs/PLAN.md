# Pratala on NEAR — Hackathon Plan (v2, after user feedback)

## Context

**Why:** Enter the NEAR HACKATHON (Nov 1–14 2026, $250K pool; 13 tracks × $10K/$3K/$2K + $55K grand prize) by rebuilding the prototype `/Users/danzrrr/Downloads/pratala-web3` as a real NEAR product in a new repo at `/Users/danzrrr/Documents/PROJECTS/pratala-near` (empty, not a git repo).

**Deadline:** public repo + X demo post + submission by **2026-11-14 23:59 UTC** (today 2026-11-07 → 7 days). Judging Nov 16–18: Claude Code + Codex screen reproducibility first, then human judges.

**Product (owner's brief):** Indonesian agriculture marketplace linking farmers, seed/fertilizer suppliers and buyers/investors without middlemen (the local harvest traders who set the price). On-chain core: a *harvest projection* (e.g. 1,000 kg rice, month M) is a token; an investor pre-funds it into escrow; a 3-layer verification (field agent → cooperative / farmer group → warehouse weigh-in) is the oracle; weigh-in settles escrow to the farmer and refunds under-delivery to the token holder. Web3 must stay invisible to farmers.

**Prototype to port (~800 LOC):** `server.mjs` 1Click proxy (tokens/quote/deposit-submit/status, BigInt `decimalToBaseUnits`), landing copy, 3-step verification concept, green/lime/paper palette. No contracts, wallet, or DB exist.

### Decisions made with the user
| Decision | Choice |
|---|---|
| Tracks | `realworld` (primary) + `nfts` + `open`; add `privacy` only if the TEE-attested AI evidence check ships (see §4) |
| Contracts | **Rust / near-sdk-rs 5.30.1** (near-sdk-js archived 2026-10-30, "DO NOT USE") |
| Wallets | Everyone connects a wallet through **NEAR Connect** (HOT Wallet MPC, Meteor, Nightly, MyNearWallet, WalletConnect…); seamless signing via function-call keys; no custodial keys |
| Backend | **NestJS 12 + Prisma 7.10.1 + Postgres 16**, dockerized |
| Frontend | **Next.js 16.4 App Router**, Tailwind v4, shadcn, TanStack Query → Vercel |
| Structure | Mirror `/Users/danzrrr/Documents/PROJECTS/bunkr` conventions, in ONE public repo |
| Feedback v2 | Redesign the flow end-to-end, better UI/UX (Hallmark-driven), MPC/social wallets, NEAR AI, install the reference project's skills + NEAR skills |
| Feedback v3 | **Every update is committed to git as its own commit** (conventional commits, pushed per milestone) — see §8b |

### Verified facts (fetched 2026-11-07)
- Rules: no mandatory sponsor integration; multi-track OK; README must be machine-readable "do X → see Y"; list libraries/templates/AI-generated code; MIT LICENSE; disclose pre-existing prototype (code since 2026-10-19 counts); no secrets in git history; one submission per repo (`POST https://nearhackathon.com/api/applications`, print payload, human confirms).
- Track 08 wants stablecoin rails, invoice/pay links, paid/pending/refunded status w/ tx links, CSV an accountant opens. Track 10 wants NFTs that hold money/credentials, README on how control passes on transfer, tests incl. sale mid-payout, per-NFT history. Track 03 (privacy) wants private AI / TEE / NEAR AI Cloud.
- Toolchain present: node 24, pnpm 12, cargo/rustc 1.95, docker 28 + compose v2. Missing: cargo-near (0.23.0), near-cli-rs, `wasm32-unknown-unknown` target.
- Rust: near-sdk / near-contract-standards 5.30.1 (MSRV 1.95); integration tests via `near-sandbox 0.3 + near-api 0.8.6 + cargo-near-build 0.11.5` (official), fallback near-workspaces 0.24.
- JS: `near-api-js` 7.4.0 (single pkg, `near-api-js/nep413`), `@hot-labs/near-connect` 0.12.0, `near-connect-hooks` 1.1.6 (`NearProvider`, `useNearWallet`), `function-call-key-plugin` 2.2.0 (`createAccessKeyPlugin({network, providers, signIn:{contractId, methodNames, allowance}})`, signs permitted calls locally, falls back to wallet), `@hot-labs/kit` 1.6.4 (HOT Kit: omni payments, "Connect via Google" experimental/wip), `chainsig.js` 1.1.16, `@tanstack/react-query` 5.107.1, `openai` 7.53.0, `@nestjs/core` 12.4.0, Prisma stable **7.10.1** (npm `latest` is 8.0 RC — pin 7.10.1), Next 16.4.5. `create-near-app --frontend next-app` = App Router + NEAR Connect + near-api-js.
- Wallets: HOT Wallet is a non-custodial MPC multichain wallet (Telegram mini-app, extension, mobile; 30M+ claimed) reachable via NEAR Connect (`connector.connect("hot-wallet")`). FastAuth is **deprecated** (repo archived 2026-07-28; MPC+Auth0 successor announced, no package). NEAR docs point to Privy/Web3Auth for Google login. Chain Signatures: `v1.signer` / `v1.signer-prod.testnet`, outbound-only (not for verifying inbound deposits).
- Backend auth: NEP-413 `wallet.signMessage({message, recipient, nonce})` → `verifyMessage` from `near-api-js/nep413` (checks full-access key via RPC).
- NEP-141 escrow: `ft_transfer_call(receiver, amount, msg)` (1 yocto, 100 Tgas) → `ft_on_transfer` returns refund; panic = full refund. Global FT `ft.globals.primitives.testnet` has no faucet → own mock pUSDC.
- 1Click: `https://1click.chaindefuser.com/v0`, **mainnet only**, `dry:true` = quote w/o deposit address, `X-API-Key`/Bearer optional (+0.25% without), statuses PENDING_DEPOSIT, KNOWN_DEPOSIT_TX, PROCESSING, SUCCESS, INCOMPLETE_DEPOSIT, REFUNDED, FAILED.
- NEAR AI Cloud: `https://cloud-api.near.ai/v1`, OpenAI-compatible (`openai` SDK with `baseURL`), `Authorization: Bearer`, public catalog `GET /v1/model/list` (64 models). **Vision models available**: `Qwen/Qwen3-VL-30B-A3B-Instruct` ($0.15/M in), `z-ai/glm-5.3-flash` ($0.08/M in), `deepseek/deepseek-v4.1-flash`, plus Incognito-tier proprietary models (OpenAI/Anthropic/Gemini – not TEE). Signed responses: `GET /v1/signature/{chat_id}`; attestation `GET /v1/attestation/report?model=…`; Verification Center `https://cloud.near.ai/verify`. Credits bought at cloud.near.ai ($10 NEAR Builders credit claimed by hackathon page, not verified in docs).
- NEAR agent skills repo has 8 skills: near-ai-cloud, near-api-js, near-cli-rs, near-contract-audit, near-dapp, near-intents, near-kit, near-smart-contracts (`npx skills add near/agent-skills --skill <name>`). Community skill `nearbuilders/near-skills` → `near-connect-hooks`.
- Accounts `pratala.testnet` and `pratala.near` currently unregistered (free).

### Bunkr conventions to mirror
Per-folder `AGENTS.md` (+ `CLAUDE.md` = `@AGENTS.md`), `.agents/skills/` pinned in `skills-lock.json`, `docs/` one md per topic, conventional commits. Backend: Nest scaffold, `.prettierrc` `{singleQuote, trailingComma:"all"}`, jest in package.json, `test/jest-e2e.json`. Frontend (from `lp/`): `components/ui` (shadcn), `components/<feature>`, `app/[route]/_components|_hooks`, `lib/`, `hooks/queries/use-*.ts` + `hooks/mutations/use-*-mutation.ts` with key factories, Server Components first, kebab-case, no barrels, `createMetadata()` in `lib/seo.ts`, Hallmark-generated `tokens.css` (`--bk-*` → here `--pt-*`) + shadcn OKLCH vars in `globals.css`, Phosphor icons (`/dist/ssr`), Geist fonts, 800-line cap. Contracts: Cargo workspace `members = ["contracts/*"]`, each `contracts/<kebab>/src/{lib,types,storage,errors,events,test}.rs`, root `Makefile`, 500-line cap, never deploy without user asking.

---

## 1. Product redesign — roles, journeys, screens

### Personas & roles (on-chain allowlists + off-chain profile)
| Role | Who | Wallet path | Key jobs |
|---|---|---|---|
| **Farmer** | smallholder, low digital literacy, phone-first | HOT Wallet (Telegram mini-app, MPC) or Meteor; FC-key so no popups | register plot, create harvest projection, follow status, receive payout |
| **Field agent** | trained agricultural extension worker, visits plots | same; FC-key for `attest_field` | task queue, geotagged photo, AI pre-check, one-tap attest |
| **Cooperative / farmer group** | community org, trusted reviewer | wallet (multi-user later) | review queue, approve/reject, declare crop failure |
| **Warehouse** | collection point with scale | wallet; FC-key for `weigh_in` | weigh-in form w/ ticket photo → AI OCR prefill → settle |
| **Buyer / Investor** | offtaker, supplier, retail investor; crypto-capable | any NEAR Connect wallet; pays pUSDC or cross-chain | discover lots, trust panel, fund, portfolio, claim refunds, CSV, transfer NFT |
| **Farm-input supplier** | seed/fertilizer seller | wallet | list inputs, receive pUSDC, orders |
| **Admin** (Pratala) | platform operator | owner key | roles, fee, treasury, pause, region stats |

### Core journeys (what the demo video shows, in order)
1. **Onboard**: Connect (HOT/Meteor/…) → first-time role picker ("I'm a farmer / I'm a buyer / I'm a verifier (invite)") → profile (name, region) → optional "Sign in to Pratala" (NEP-413) for off-chain features → FC-key sign-in for verifier roles (no further popups).
2. **Farmer registers a plot & projection** (`/farmer/new`, 3 steps, plain language): plot photos + GPS (EXIF/geolocation) → crop/variety/area/projected kg/harvest month (AI yield sanity hint) → review → sign `register_lot` (1 tx). Sees "Waiting for a field agent visit".
3. **Field agent verifies** (`/verify`, mobile queue): open task → camera → photo gets AI check ("rice paddy ✓, GPS within 150 m of plot ✓, stage: vegetative") → note → attest (FC-key, silent). Lot → FieldVerified; farmer gets inbox notification.
4. **Co-op reviews** (`/verify` with coop role): compares agent evidence + AI check → approve → CoopVerified. Farmer sets price → **Listed**, gets a shareable **pay link** `/lot/lot-7`.
5. **Buyer funds** (`/lot/[id]` → `/checkout/[id]`): trust panel (3-layer verification, AI check badge, farmer track record), funding math, pay with pUSDC (`ft_transfer_call`) **or** see a live cross-chain quote (NEAR Intents, mainnet dry). NFT moves to buyer; escrow shown as "Held in contract", receipt page `/receipt/[tx]`.
6. **Warehouse weigh-in**: photo of scale ticket → AI OCR prefills kg/grade → settlement preview (farmer 396.90 / platform 8.10 / buyer refund 45.00) → `weigh_in`. Lot **Settled**.
7. **Money out**: farmer `/farmer` "Withdraw 396.90 pUSDC" (claim_payout); buyer `/portfolio` "Claim refund 45.00"; `/exports` CSV for the bookkeeper; every row links to testnet explorer.
8. **NFT does something**: buyer transfers the lot NFT to another account → new holder sees the claimable refund, old holder cannot (`/lot/[id]` history shows ownership + money timeline).

### Screen map (Next.js routes)
| Route | Purpose |
|---|---|
| `/` | Landing (Hallmark-designed, ported copy, live stats from chain: lots verified, pUSDC settled) |
| `/market` | Discover: tabs Harvest lots / Farm inputs; filters crop/region/status/harvest month; map toggle (plot GPS dots, Leaflet, stretch) |
| `/lot/[id]` | Public lot page = pay link: header, status stepper, **Trust panel** (attestations w/ evidence thumbnails + hashes, AI check badge → NEAR AI verify link, farmer history), Funding panel, Money timeline, NFT ownership history, share button |
| `/checkout/[id]` | Tab A pUSDC (live testnet); Tab B "Pay from any chain" (1Click dry quote, honest banner); success → `/receipt/[txHash]` |
| `/receipt/[txHash]` | Printable receipt: parties, amount, status, explorer link, QR |
| `/onboarding` | Role picker + profile |
| `/farmer` | Dashboard: plots, lots (status cards), claimable payout CTA, inbox |
| `/farmer/new` | 3-step wizard |
| `/verify` | Role-adaptive queue (agent / coop / warehouse) — mobile-first, camera-first |
| `/portfolio` | Buyer: funded lots, NFTs held, claimable refunds, transfer NFT, CSV |
| `/supplier` | Listings CRUD, orders |
| `/exports` | Ledger table + CSV |
| `/admin` | Roles, fee, treasury, pause, region stats |
| `/faucet` | Get pUSDC (storage_deposit + faucet in one tx) |
| `/activity` | Public event feed (indexer) — transparency |

### UX principles (enforced by `impeccable` + Hallmark)
English-only UI in plain, short sentences (one dictionary, no language toggle, `next-intl` not needed); no crypto words on farmer screens ("wallet" never mentioned — "account"), amounts shown as "pUSDC ≈ Rp" with a fixed demo rate labelled; every tx shows a plain status line + "View proof" (explorer); FC-key so verifiers never see popups after sign-in; optimistic UI + undo where safe; mobile 320–414 px verified; 8 interactive states per control.

---

## 2. Repo tree (`/Users/danzrrr/Documents/PROJECTS/pratala-near`)

```
README.md  LICENSE(MIT)  AGENTS.md  CLAUDE.md(@AGENTS.md)  .gitignore  .editorconfig  .nvmrc(24)
package.json (pnpm workspaces: frontend, backend)  pnpm-workspace.yaml  docker-compose.yml  .env.example
.github/workflows/contracts.yml  js.yml
deploy/testnet.json                 # contract ids, demo accounts, tx hashes (written by scripts)
docs/  ARCHITECTURE.md CONTRACTS.md PAYMENTS.md NFT-CONTROL.md INTENTS.md AI-VERIFICATION.md WALLETS.md DEMO-SCRIPT.md DISCLOSURE.md
scripts/ 00-install-toolchain.sh 01-install-skills.sh 02-create-accounts.sh 03-deploy-contracts.sh 04-seed-demo.sh 05-verify-demo.sh lib.sh
smart-contract/   Cargo.toml (workspace, release profile) Cargo.lock rust-toolchain.toml Makefile AGENTS.md .agents/skills (near-smart-contracts, near-contract-audit, near-cli-rs)
  contracts/harvest-lot/{Cargo.toml, src/{lib,types,storage,errors,events,roles,lifecycle,escrow,views,test}.rs, tests/{common,happy_path,refunds,transfer,access}.rs}
  contracts/pusdc/{Cargo.toml, src/{lib,test}.rs}
backend/  Dockerfile package.json nest-cli.json .prettierrc .env.example AGENTS.md .agents/skills (nestjs-best-practices, nestjs-expert, prisma-*, near-api-js, near-intents, near-ai-cloud)
  prisma/{schema.prisma, migrations/, seed.ts}
  src/ main.ts app.module.ts config/env.ts common/{guards,decorators,filters,near/rpc.service.ts}
       auth/ users/ plots/ evidence/ ai/ lots/ listings/ indexer/ payments/ intents/ notifications/ health/
  test/
frontend/ package.json next.config.ts components.json .env.example vercel.json AGENTS.md .agents/skills (vercel-react-best-practices, vercel-composition-patterns, shadcn, tailwind-design-system, tanstack-query-best-practices, seo-aeo-best-practices, design-taste-frontend, impeccable, near-dapp, near-connect-hooks)
  tokens.css (Hallmark)  .hallmark/log.json
  app/ layout.tsx page.tsx globals.css robots.ts sitemap.ts
       market/ lot/[id]/ checkout/[id]/ receipt/[txHash]/ onboarding/ farmer/ farmer/new/ verify/ portfolio/ supplier/ exports/ admin/ faucet/ activity/   (each with _components/, _hooks/)
  components/ui/*  components/{wallet,lot,verification,escrow,intents,ai,layout}/*
  providers/{near-provider.tsx, query-provider.tsx, locale-provider.tsx}
  lib/{near/contracts.ts, near/format.ts, near/fc-keys.ts, api.ts, roles.ts, explorer.ts, seo.ts, i18n.ts, utils.ts}
  hooks/queries/use-*.ts  hooks/mutations/use-*-mutation.ts
```

---

## 3. Smart contracts (`smart-contract/`)

### 3.1 `harvest-lot` (NEP-171/177/181/178 via near-contract-standards + escrow)
Start from near-examples/NFT pattern (hand-written `impl NonFungibleTokenCore` delegating to `NonFungibleToken`).

**State:** `tokens: NonFungibleToken`, `metadata: LazyOption<NFTContractMetadata>`, `lots: IterableMap<TokenId, Lot>`, `next_lot_id`, `field_agents/coops/warehouses: IterableSet<AccountId>`, `usdc_contract`, `treasury`, `fee_bps: u16`, `paused`.

**Lot:** `lot_id, farmer_id, crop, variety?, region, projected_kg, harvest_month("YYYY-MM"), plot_hash, gps_hash, area_m2?, price_per_kg: U128(6dp), status, attestations: Vec<Attestation>(≤8), escrow: U128, funder?, funded_at_ms?, actual_kg?, grade?, settled_at_ms?, claims{farmer,holder,treasury}: U128, claim_lock: bool, created_at_ms`.
**Status:** Registered → FieldVerified → CoopVerified → Listed → Funded → Settled | Refunded; Cancelled.
**Attestation:** `kind(FieldVisit|CoopReview|WarehouseWeighIn|CropFailure), signer, timestamp_ms, evidence_hash(sha256 hex), evidence_uri?, ai_check_hash? (sha256 of signed NEAR AI response), note?, actual_kg?, grade?, gps_hash?`.

**Methods**
| Method | Caller | Transition / notes |
|---|---|---|
| `new(owner_id, usdc_contract, treasury, fee_bps, metadata)` `#[init]` | deployer | — |
| `add_role/remove_role(role, account_id)`, `set_fee_bps(≤1000)`, `set_treasury`, `set_paused` | owner | `RoleChanged` |
| `register_lot(args) -> TokenId` `#[payable]` | any → farmer | mint NFT to farmer; → Registered |
| `attest_field(lot_id, evidence_hash, evidence_uri?, gps_hash, ai_check_hash?, note?)` `#[payable]` | FieldAgent | Registered → FieldVerified |
| `attest_coop(lot_id, evidence_hash, evidence_uri?, note?)` `#[payable]` | Coop (≠ field attester) | FieldVerified → CoopVerified |
| `list_lot(lot_id, price_per_kg)` / `update_price` / `delist_lot` | farmer (= owner) | CoopVerified ↔ Listed |
| `cancel_lot(lot_id)` | farmer or owner | pre-Listed → Cancelled |
| `ft_on_transfer(sender_id, amount, msg) -> PromiseOrValue<U128>` | **predecessor == usdc_contract** | Listed → Funded; msg `{"action":"fund","lot_id":"lot-1"}`; total = projected_kg×price; require amount ≥ total; escrow = total; return excess; NFT farmer→sender via `internal_transfer` (verify event emission in 5.30.1 source); invalid → panic (full refund) |
| `weigh_in(lot_id, actual_kg, grade, evidence_hash, evidence_uri?, ai_check_hash?)` `#[payable]` | Warehouse | Funded → Settled; computes claims |
| `declare_failure(lot_id, reason, evidence_hash)` | Coop or owner | Funded → Refunded; `claims.holder = escrow` |
| `claim_payout` / `claim_refund` / `claim_fee (lot_id) -> Promise` | farmer / **current nft owner** / owner-or-treasury | require `!claim_lock`, claim>0; lock; zero claim; `ext_ft.ft_transfer` (1 yocto, 15 Tgas) `.then(on_claim_resolved)` 10 Tgas |
| `on_claim_resolved(lot_id, kind, amount, #[callback_result])` `#[private]` | self | ok → `escrow -= amount`; fail → restore claim; unlock; `PayoutClaimed{ok}` |
| `nft_transfer` / `nft_transfer_call` overrides | — | `assert_transferable`: `!claim_lock && status != Cancelled` then delegate |

**Settlement:** `delivered = min(actual, projected); gross = delivered×price; fee = gross×fee_bps/10_000; farmer = gross−fee; treasury = fee; holder = escrow−gross; assert sum == escrow`. README example: 1,000 kg × 0.45 = 450; 900 kg, 2% → 396.90 / 8.10 / 45.00.

**Views:** `get_lot, get_lots(from,limit), get_lots_by_status, get_lots_by_farmer, get_lots_for_holder, get_attestations, get_claims, quote_funding, get_roles(account), list_role(role), get_config, get_stats{lots, verified, settled_volume}`. **Events** (`#[near(event_json(standard="pratala"))]` v1.0.0): `LotRegistered, LotAttested, LotListed, LotFunded, LotSettled, LotRefunded, PayoutClaimed, RoleChanged, LotCancelled`.

**Storage/gas:** payable methods charge storage delta and refund excess; bound strings 256; `ft_on_transfer` <20 Tgas; claims 60 Tgas from frontend; FC-key allowance 0.25 NEAR for verifier methods (`attest_field`, `attest_coop`, `weigh_in` are **payable for storage** → FC keys cannot attach deposit ⇒ make these methods charge storage from a contract-held pool pre-funded by admin, i.e. **not payable**, bounded by attestation cap). Decision: verifier methods are non-payable; contract owner funds storage; `register_lot` stays payable (farmer pays once via wallet popup).

### 3.2 `pusdc` (NEP-141 mock)
Fork near-examples/FT (near-sdk 5.30.1): `new(owner_id, total_supply, metadata{spec:"ft-1.0.0", name:"Pratala Test USDC", symbol:"pUSDC", decimals:6})` + `faucet(amount ≤ 10_000 pUSDC)` (caller registered; `internal_deposit`; `FtMint`) + owner `mint`. Frontend faucet = `storage_deposit` + `faucet` in one tx.

### 3.3 Farm-input marketplace: off-chain
`InputListing` + `Order` in Postgres; checkout = buyer `ft_transfer(seller, amount, memo="order:<uuid>")`; backend verifies tx → PAID. Escrow for inputs = stretch.

### 3.4 Tests
Unit (`VMContextBuilder`): settlement math, state machine, roles, msg parsing, `assert_transferable`. Integration (`tests/common.rs` builds both wasm via `cargo_near_build`, deploys, registers actors, mints pUSDC): 1 happy path · 2 under-delivery · 3 crop failure · 4 transfer-while-funded + mid-payout lock · 5 unauthorized/wrong role · 6 double fund & insufficient → full refund · 7 excess refund · 8 faucet cap. Run `cd smart-contract && cargo test`.

---

## 4. NEAR AI integration (AI evidence check)
Backend `ai` module using `openai` SDK with `baseURL: https://cloud-api.near.ai/v1`, model `Qwen/Qwen3-VL-30B-A3B-Instruct` (default, cheap, vision; fallback `z-ai/glm-5.3-flash`). **Verify at implementation** which vision models are Confidential-TEE tier (`/v1/model/list` metadata or cloud.near.ai models page); prefer a TEE-tier model so the farmer's plot photos never leave a TEE — that is the `privacy` track hook.
1. `POST /ai/check` `{evidenceId, lotId, kind}` → sends image + structured prompt: crop match (expected crop), scene plausibility (field/paddy/warehouse scale), visible growth stage, GPS plausibility vs plot (text), for `WEIGH_IN`: OCR `{kg, grade}` from the ticket; returns JSON `{verdict: pass|review|fail, confidence, findings[], extracted{kg?,grade?}, summary_en}`.
2. Store `AiCheck{evidenceId, model, chatId, responseJson, signature (from GET /v1/signature/{chat_id}), responseHash}`; `ai_check_hash = sha256(responseJson)` goes on-chain in the attestation.
3. UI: "AI check: pass · Qwen3-VL on NEAR AI Cloud (TEE) · Verify ↗" badge linking to `https://cloud.near.ai/verify` with chat id; `docs/AI-VERIFICATION.md` explains it is advisory, humans attest.
4. Stretch: "Pratala Assistant" chat explaining a lot's status/payouts (text model), yield sanity hint on the wizard.
Env: `NEAR_AI_API_KEY`, `NEAR_AI_BASE_URL`, `NEAR_AI_VISION_MODEL`. If key missing → UI shows "AI check unavailable" and flow continues (never blocks).

---

## 5. Wallet & identity strategy
- **Connector:** `@hot-labs/near-connect` 0.12 via `near-connect-hooks` 1.1.6 `NearProvider`/`useNearWallet`; `NearConnector({ network: 'testnet' })`, wallets from manifest (HOT Wallet MPC, Meteor, Nightly, MyNearWallet, WalletConnect…). Onboarding screen shows **HOT Wallet (Telegram)** and **Meteor** as the recommended two for Indonesian users; `connector.connect("hot-wallet")` deep button.
- **Seamless signing:** `function-call-key-plugin` 2.2.0 `createAccessKeyPlugin({ signIn: { contractId: LOTS, methodNames: ['attest_field','attest_coop','weigh_in','list_lot','update_price','delist_lot','claim_payout','claim_refund'], allowance: nearToYocto('0.25') } })` — verifier and farmer actions after sign-in need no popups; funding (`ft_transfer_call` on pUSDC, 1 yocto) and `register_lot` (storage deposit) go through the wallet.
- **Off-chain session:** NEP-413 challenge/verify → JWT cookie; only gates uploads/profile/inbox; chain features never require it. Wallets lacking `signMessage` get a clear message.
- **Social login (stretch, documented in `docs/WALLETS.md`):** HOT Kit `@hot-labs/kit` "Connect via Google" (experimental) → HOT MPC account; FastAuth is deprecated so not used; Privy/Web3Auth noted as production options. Chain Signatures noted on roadmap (outbound only).

---

## 6. Backend (`backend/`, NestJS 12 + Prisma 7.10.1 + Postgres 16)
Routes (prefix `/api`, cookie JWT, CORS):
- `health` · `auth` (challenge/verify/logout/me w/ roles cache) · `users` (profile, locale, role intent) · `plots` (plotHash/gpsHash) · `evidence` (multipart ≤8 MB, EXIF via `exifr`, local disk | MinIO) · `ai` (§4) · `lots` (mirror, `metadata.json` NFT reference, history) · `listings`/`orders` · `indexer` (`POST /tx` → RPC FINAL → `EVENT_JSON:` parse → upsert; 30 s reconcile via `get_lots`) · `payments` (ledger, `export.csv` UTF-8 BOM/CRLF columns `date_utc, lot_id, crop, type, from_account, to_account, amount_pusdc, status, tx_hash, explorer_url, note`) · `notifications` (inbox rows from events per account, `GET /notifications`, mark read) · `intents` (port of `server.mjs`: tokens 60 s cache, quote w/ `decimalToBaseUnits` verbatim, API key on all calls, `dry` default true, deposit/submit, status; throttle 20/min).
Prisma models: `User, AuthChallenge, Plot, Evidence, AiCheck, Lot, LotEvent(@@unique txHash+receiptId+event), Payment, InputListing, Order, IntentsQuote, Notification`.
docker-compose: `postgres:16-alpine` + `api` (multi-stage node:24-alpine, `prisma migrate deploy && node dist/main`, :4000) + optional `minio` profile. Env: `DATABASE_URL, PORT, JWT_SECRET, AUTH_RECIPIENT, NEAR_NETWORK, NEAR_RPC_URL=https://test.rpc.fastnear.com, LOTS_CONTRACT_ID, PUSDC_CONTRACT_ID, EXPLORER_BASE=https://testnet.nearblocks.io, FRONTEND_ORIGIN, UPLOAD_DIR, S3_*?, NEAR_INTENTS_API_KEY?, NEAR_AI_API_KEY?, NEAR_AI_VISION_MODEL, INDEXER_POLL_MS`.

---

## 7. Frontend design process (Hallmark + bunkr skills)
1. Seed: `npx create-near-app@latest frontend --frontend next-app` (working NEAR Connect wiring) → pnpm, Tailwind v4, shadcn (`components.json` style neutral, Phosphor icons), TanStack Query provider, `near-connect-hooks`.
2. Run **Hallmark default flow** on Day 4 with pre-answered gate: *Audience* = Indonesian smallholder farmers + co-op verifiers (phone-first, non-crypto) and crypto-capable buyers/investors; *Use case* = fund a verified harvest lot / register one; *Tone* = **soft-utilitarian** (warm, trustworthy, document-like). Theme route: custom-theme signal fires (brand palette exists: paper / deep green / lime) → ask Hallmark for a **tuned custom theme** anchored on the prototype palette (or catalog **Garden** if time is short). Genre editorial. Macrostructure for landing: Long Document or Stat-Led (real chain stats only, no invented metrics). Nav N1b/N5, footer Ft5. Hero enrichment: real rice-field photo in `<figure>` (Unsplash, credited). Output `tokens.css` (`--pt-*`) + shadcn vars; `.hallmark/log.json`; stamp.
3. App screens follow `impeccable` + `vercel-composition-patterns`: compound components (`LotCard`, `StatusStepper`, `TrustPanel`, `MoneyTimeline`, `TxStatusLine`, `EvidenceUploader`, `AiCheckBadge`, `AmountInput`, `RoleGate`), 8 states each, mobile 320–414 verified, `prefers-reduced-motion`.
4. SEO: `createMetadata()` per page, JSON-LD on `/lot/[id]` (Product/Offer), `robots.ts`, `sitemap.ts`, OG image route for pay links.
Env: `NEXT_PUBLIC_NEAR_NETWORK, NEXT_PUBLIC_RPC_URL, NEXT_PUBLIC_LOTS_CONTRACT_ID, NEXT_PUBLIC_PUSDC_CONTRACT_ID, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_EXPLORER_BASE, NEXT_PUBLIC_AUTH_RECIPIENT, NEXT_PUBLIC_DEMO_IDR_RATE`. Vercel root `frontend`, Node 24; "API offline — on-chain data only" banner.

---

## 8. Skills to install (Day 1, `scripts/01-install-skills.sh`, pinned in each folder's `skills-lock.json`)
- **NEAR (all folders as relevant):** `npx skills add near/agent-skills --skill near-smart-contracts|near-contract-audit|near-cli-rs` (smart-contract), `--skill near-api-js|near-intents|near-ai-cloud` (backend), `--skill near-dapp|near-api-js|near-intents` (frontend); `npx skills add nearbuilders/near-skills --skill near-connect-hooks` (frontend).
- **Frontend (from bunkr `lp/skills-lock.json`):** `vercel-labs/agent-skills` → react-best-practices, composition-patterns; `shadcn/ui` → shadcn; `wshobson/agents` → tailwind-design-system; `deckardger/tanstack-agent-skills` → tanstack-query; `sanity-io/agent-toolkit` → seo-aeo-best-practices; `leonxlnx/taste-skill` → design-taste-frontend; `pbakaus/impeccable` → impeccable.
- **Backend (from bunkr `backend/skills-lock.json`):** `kadajett/agent-nestjs-skills` → nestjs-best-practices; `jeffallan/claude-skills` → nestjs-expert; `prisma/skills` → prisma-cli, prisma-client-api, prisma-database-setup, prisma-postgres.
- Each folder's `AGENTS.md` maps domain → mandatory skill (bunkr format), plus root `AGENTS.md` describing the monorepo and the hackathon README rules.

---

## 8b. Git workflow — every update committed historically (user requirement)
- **Day 1, first action:** `git init -b main` in `/Users/danzrrr/Documents/PROJECTS/pratala-near`; first commit = `chore: scaffold monorepo (README, LICENSE, AGENTS.md, workspace)`. Create the public GitHub repo early (`gh repo create <org>/pratala-near --public --source . --push` — ask the user for org/name and whether to push before running it); public from day one satisfies the "code since 2026-10-19" rule and lets judges see the history.
- **Granularity:** one commit per completed unit of work — each contract module, each test file, each backend module, each frontend route/component group, each doc, each script. Never batch a whole day into one commit; never leave the tree dirty at the end of a work block.
- **Format:** Conventional Commits as in bunkr (`feat(contract): add ft_on_transfer escrow`, `test(contract): transfer-while-funded`, `feat(api): nep413 auth`, `feat(web): verify queue`, `docs: payments guide`, `chore: install skills`), ending with the attribution trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Guards:** `.gitignore` covers `.env*`, `target/`, `node_modules/`, `data/uploads/`, `neardev/`, `~/.near-credentials` never in repo; a pre-commit secret scan (`gitleaks` via `scripts/lib.sh` or a simple grep hook) — a leaked key means a history rewrite, which the deadline cannot afford.
- **Milestones:** tag `v0.1.0-contracts` (Day 3), `v0.1.0-app` (Day 5), `v0.1.0` (Day 6, what the demo video shows), `hackathon-submission` (Day 7). `docs/DISCLOSURE.md` links the first commit and the tag range as the judged window.
- **Pushes:** push after each tagged milestone and at the end of each day at minimum (confirm the remote with the user once; after that pushing is routine).

## 9. Seven-day build order
**Must (M):** contracts on testnet + sandbox tests; onboarding + farmer wizard + verify queue + lot page + checkout (pUSDC) + portfolio claims + faucet + exports CSV; Hallmark landing; README/LICENSE/disclosure; video; X post; submission. **Should (S):** backend auth/evidence/indexer/notifications hosted; AI evidence check with signature badge; Intents dry-quote tab; supplier listings + checkout; receipts; CI. **Stretch (X):** map view, Assistant chat, HOT Kit Google login, secondary-market UI, MinIO, expiry refunds.

- **Day 1 Sat Nov 8 (M):** toolchain (`rustup target add wasm32-unknown-unknown`; cargo-near & near-cli-rs installers; fallback `cargo binstall`); `git init`, root files, AGENTS.md files, LICENSE, workspace; **install all skills** (§8); `pusdc` from near-examples/FT + faucet, `cargo near build non-reproducible-wasm`; `harvest-lot` skeleton; create `pratala.testnet` + sub-accounts (ask user before any deploy per bunkr rule); deploy+init pusdc.
- **Day 2 Sun Nov 9 (M):** lifecycle/escrow/events/guards + unit tests; deploy v0; CLI walkthrough.
- **Day 3 Mon Nov 10 (M/S):** integration tests 1–8; scripts 02–05 (seed full lifecycle, write `deploy/testnet.json`). Backend scaffold, Prisma, compose, health, auth (NEP-413) e2e, evidence, ai module skeleton.
- **Day 4 Tue Nov 11 (M):** frontend seed + providers + FC-key plugin; **Hallmark run** (tokens, landing); `lib/near/contracts.ts`; onboarding, `/farmer(+new)`, `/verify`, `/lot/[id]`, `/faucet`, `/checkout` tab A, `/portfolio`. Walk the lifecycle with 5 testnet wallets (HOT + Meteor + MyNearWallet).
- **Day 5 Wed Nov 12 (M/S):** indexer, payments + CSV, notifications, lots mirror, intents port, listings/orders; frontend `/exports`, `/admin`, `/receipt`, `/activity`, AI check wiring + badge, checkout tab B, plain-English copy pass; deploy Vercel + API (Railway/Render); clean-clone compose check.
- **Day 6 Thu Nov 13 (M):** README + docs/*; `impeccable` audit pass on all screens (mobile widths); run README on clean clone + `claude -p "follow README"`; CI green; record 3-min demo; tag `v0.1.0`.
- **Day 7 Fri Nov 14 (M):** re-run `05-verify-demo.sh`, final README (ids, tx links), X post (@NEARProtocol #NEARHackathon + video), submit by **18:00 UTC** after user confirms payload. Afternoon S/X only.

---

## 10. README skeleton (judge-facing)
1 Title + tracks/testnet/MIT badges · 2 What Pratala does + video + live URL · 3 **Try it in 5 minutes** ("do X → see Y": Connect with HOT/Meteor → `/faucet` 1,000 pUSDC → `/lot/lot-1` Listed + 2 attestations + AI check → Fund 450 → Funded, NFT owner = you → judge CLI `scripts/05-verify-demo.sh`) · 4 Run locally (versions, `pnpm install`, `docker compose up -d`, migrate, `pnpm dev`; contracts `cargo test`, scripts) · 5 For the bookkeeper (statuses, fee, CSV, 450→396.90/8.10/45.00) · 6 How the NFT carries money and control (`claim_lock`, owner_by_id at claim time, `transfer.rs`) · 7 AI evidence check & verification (NEAR AI Cloud, signed responses, advisory) · 8 Wallets (HOT MPC, Meteor, FC keys, NEP-413) · 9 Architecture (mermaid) · 10 Contracts (ids, methods, events, deploy tx) · 11 Demo accounts · 12 How NEAR is used (NEP-171/177/181/178, NEP-141 `ft_transfer_call` escrow, NEP-297 events, NEP-413, function-call keys, NEAR Connect, Intents 1Click, NEAR AI Cloud) · 13 Limitations (1Click mainnet-only dry quotes, pUSDC mock, allowlisted oracles, AI advisory, no legal/RWA compliance, hashes not pinned) · 14 Disclosure (prototype `pratala-web3`, AI-generated code, templates, libraries w/ versions, Unsplash) · 15 Tests · 16 Roadmap/business model · 17 License.

---

## 11. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Scope grew (AI, more screens) in 7 days | Strict M/S/X cut; AI check is S with graceful "unavailable" fallback; Day 7 buffer |
| cargo-near / near-cli-rs install on arm64 | `cargo binstall cargo-near near-cli-rs`; Day 1 first thing |
| FC keys cannot attach deposit → payable verifier methods fail | Verifier methods non-payable; owner pre-funds contract storage; cap attestations |
| HOT Wallet testnet support / `signMessage` support varies | Test HOT + Meteor + MyNearWallet on Day 4; chain features never need NEP-413 login |
| NEAR AI vision model TEE tier unclear; `privacy` track claim | Only add `privacy` track if model tier verified TEE; otherwise badge says "Incognito/3P" honestly |
| `internal_transfer` semantics in `ft_on_transfer` | Verify in near-contract-standards 5.30.1 source Day 2; test asserts owner + log |
| Payout `ft_transfer` fails (unregistered) | Pull model + callback restore; UI pre-checks `storage_balance_of`; seed registers actors |
| 1Click no JWT / rate limits | `dry:true`, cache, throttle, fee notice; optional key |
| Vercel needs public API | Chain-first reads; hosted API is S; offline banner |
| Prisma `latest` is RC | Pin 7.10.1 |
| Account names taken | `02-create-accounts.sh` fallbacks → `deploy/testnet.json` |
| Hallmark/design time sink | One Hallmark run for tokens + landing; app screens reuse tokens via shadcn; `impeccable` audit Day 6 only |

**Unverified, check before relying:** near-api-js v7 RPC method for tx status w/ receipts; near-connect 0.12 `signMessage` nonce type; function-call-key-plugin storage location of local key; `internal_transfer` event emission; testnet faucet amount; nearblocks URL format; NEAR AI model TEE tiers; HOT Wallet testnet availability.

---

## Verification (end-to-end)
1. `cd smart-contract && cargo fmt --check && cargo clippy && cargo test` → unit + 8 integration tests pass.
2. `scripts/00…04` on a clean clone → `deploy/testnet.json` populated; `scripts/05-verify-demo.sh` prints lot state, balances, events matching README numbers.
3. `docker compose up -d` → `GET /api/health` ok; `pnpm --filter frontend dev` → onboard with HOT or Meteor → faucet → register → attest (no popups after FC sign-in) → fund → weigh-in → claims; `/exports` CSV opens in Excel; `/checkout` tab B returns a mainnet dry quote; AI check badge shows and its verify link resolves.
4. Mobile widths 320/375/414/768 pass `impeccable` audit; Vercel URL works with API offline (banner) and online; CI green; README followed by a fresh Claude Code session succeeds.
5. Submission payload printed and confirmed by user before `POST /api/applications`.
