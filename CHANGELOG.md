# Changelog

> **Agents: read this file first.** It is the hand-off log between sessions and parallel agents. The "Current status" block is the single source of truth for what works, what is deployed, and what is open. Update it (and add an entry under `[Unreleased]`) in the same commit as any meaningful change — see `AGENTS.md` §7.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Dates are UTC+7 (developer machine). Hackathon deadline: **2026-11-14 23:59 UTC** (aim to submit by 18:00 UTC).

## Current status — 2026-11-07 23:40

| Area | State | Verified by |
| --- | --- | --- |
| Smart contracts (`smart-contract/`) | `harvest-lot` (NEP-171 + escrow, pull claims) and `pusdc` (NEP-141 + faucet) complete | `make -C smart-contract test` → 60 unit + 9 sandbox tests pass |
| Testnet deploy | **Live.** `lots.pratala.testnet`, `pusdc.pratala.testnet`, owner/treasury `pratala.testnet`, demo actors `pratala-*-69f5.testnet` (see `deploy/testnet.json`) | `scripts/05-verify-demo.sh` → all checks pass (396.90 / 8.10 / 45.00, lot-1 NFT owned by investor2) |
| Demo lots | lot-1 Settled + all claims paid · lot-2 Listed (450 pUSDC) · lot-3 FieldVerified | `05-verify-demo.sh` |
| Backend (`backend/`) | NestJS 12 + Prisma 7.10.1 + Postgres 16; all modules from `docs/INTERFACES.md` §5 | `pnpm test` 35/35, `pnpm test:e2e` 20/20, `docker compose up` healthy |
| Frontend (`frontend/`) | Next.js 16.4, 18 routes, English-only UI, Hallmark custom theme, NEAR Connect + function-call keys | `pnpm lint && pnpm typecheck && pnpm build` pass; all routes 200 |
| NEAR AI evidence check | Wired to NEAR AI Cloud, `Qwen/Qwen3-VL-30B-A3B-Instruct` (private TEE tier) | Key configured locally and accepted by the API; **live image check not yet exercised end-to-end** |
| NEAR Intents | 1Click proxy, mainnet `dry: true` quotes; partner key configured locally | `GET /v0/tokens` 200 with key |
| Scripts / CI | `scripts/00–05`, four GitHub workflows | `bash -n`; CI not yet run (no remote) |
| Git | `main`, one commit per unit of work, tag `v0.1.0-contracts` | — |

**Local run** (verified): `docker compose up -d postgres` → `pnpm -C backend db:deploy && pnpm -C backend db:seed` → `pnpm -C backend start:dev` (API :4100) → `pnpm -C frontend dev` (web :3000). Postgres for this project is on host port **5433**; port 4000 is taken on the dev machine.

### Open items (in priority order)

1. **Indonesian strings on-chain.** Lots 1–3 were registered before the English pass, so their `region` reads e.g. "Karawang, Jawa Barat". The contract has no edit method. Decision pending from the user: keep, or deploy fresh contracts to new accounts (e.g. `lots-v2.pratala.testnet`) and reseed with the English `scripts/04-seed-demo.sh`. Changing chain state needs the user's OK.
2. **Wallet testing with real wallets.** Meteor "Meteor Web" opens via a relayed `window.open`; browsers may block it as a popup (allow popups for localhost:3000, or use the Meteor extension / mobile QR). HOT Wallet is not marked testnet-capable in the live NEAR Connect manifest. Function-call-key creation at sign-in and NEP-413 `signMessage` not yet verified with a real wallet.
3. **Developer test account** `prataladev.testnet` (Meteor) has 0 NEAR and no roles. Needs testnet NEAR from a faucet, then `/faucet` for pUSDC. Granting a verifier role requires an owner `add_role` call (user approval).
4. **Root account low on NEAR**: `pratala.testnet` ≈ 2.02 NEAR. Do not spend it on transfers; top up from a faucet before redeploying.
5. **Hosting**: API host (Railway/Render) not chosen; Vercel frontend not deployed. Cross-site cookie needs `SameSite=None; Secure` when API and web are on different sites.
6. **GitHub remote**: org/repo name not given yet; nothing pushed. Repo must be public before submission.
7. **Submission tasks** (`docs/SUBMISSION.md`): demo video, X post, finalize `docs/DISCLOSURE.md` §5/§8, decide on adding the Privacy track (TEE model confirmed), mainnet payout account, submission payload shown to the user before sending.

## [Unreleased]

### Fixed
- Wallet modal ("Meteor Web" button) was unclickable: our connect sheet stayed open as a modal behind NEAR Connect's popup. The sheet now closes before handing off; all dialogs keep `.hot-connector-popup` clickable and don't treat it as an outside click (`290cce3`).
- `scripts/02-create-accounts.sh` aborted on near-cli-rs 0.31's new key-scheme prompt; now passes `--signature-scheme ed25519` (`6dd4bae`).

### Changed
- **Evidence upload is required, no device-only fallback** (frontend): the uploader's "Device only" state is gone — a photo that is not uploaded is an error. Attestations (field/co-op/weigh-in/failure) and lot registration only count photos with status "ready" (uploaded), and the register wizard no longer falls back to locally-computed plot hashes when the API is unreachable: plot creation must succeed before `register_lot` is signed.
- **Evidence storage is Google Cloud Storage only** (backend): `@aws-sdk/client-s3` and the local-disk store were removed. `GCS_BUCKET` is required env (boot fails without it or when the bucket is unreachable); `GCS_KEY_FILE` optionally points at a service-account JSON, otherwise Application Default Credentials. Evidence is still served through `GET /api/evidence/:sha256` (private bucket, no public URLs). E2E tests use an in-memory storage fake; docker-compose dropped the MinIO profile and uploads volume. (`26be0b0`)
- Onboarding "Finish" is now a single "Complete registration" button that also signs the NEP-413 backend login when needed and supported; the separate "Sign in to Pratala services" card was removed. A rejected or failed signature still completes registration (profile saved locally).
- Demo USDC→IDR conversion rate raised from 16,000 to 18,000 (frontend env default, `.env.example`, README table) — user decision to match the current rate. (`6570dfd`)
- Site footer reduced to a single line, "Pratala · built for the NEAR Hackathon 2026"; footer nav links and the contracts/RPC/fonts/photo-credit colophon were removed.
- **English-only project** (`b9c6726`…`87eff17`): Bahasa dictionary and language toggle removed from the frontend; notifications, seed listings, AI summary (`summaryEn` only), profile locale (`en` only, migrations `20261107162300_locale_en_only`, `20261107162400_ai_check_drop_summary_id`), docs, scripts seed data and contract test fixtures translated.
- `docs/INTERFACES.md` §5.1 extended by the backend (AiCheck fields, error envelope, decimal amounts, payment `occurredAt`, order transfer hint) and §3 by the contracts (NFT transfer only after funding, `reference` on `register_lot`, per-lot `fee_bps`, claims return `bool`, ≥ 40 Tgas).

### Added
- `deploy/testnet.json`: live testnet deployment record (`0fb19e5`).
- `CHANGELOG.md` (this file) and the changelog rule in `AGENTS.md`.

## [0.1.0-contracts] — 2026-11-07

### Added
- **Repo**: monorepo scaffold, MIT license, `AGENTS.md` per folder (bunkr conventions), `docs/PLAN.md`, shared ABI/API contract `docs/INTERFACES.md`, agent skills per folder (`.claude/skills`, pinned in `skills-lock.json`).
- **Smart contracts** (Rust, near-sdk 5.30.1): `pusdc` NEP-141 test stablecoin (6 dp, capped faucet, owner mint); `harvest-lot` NEP-171/177/178/181 lot NFT with lifecycle Registered → FieldVerified → CoopVerified → Listed → Funded → Settled / Refunded / Cancelled, `ft_on_transfer` escrow funding, settlement math with per-lot fee, pull-based claims with `claim_lock`, NEP-297 `pratala` events, role allowlists, pause. Unit + sandbox tests (near-sandbox 0.4 + near-api 0.8.7). Docs `CONTRACTS.md`, `NFT-CONTROL.md`.
- **Backend** (NestJS 12, Prisma 7.10.1, Postgres 16, Docker): NEP-413 auth (JWT cookie), users, plots (plot/gps hashes), evidence uploads (EXIF, local/S3), NEAR AI Cloud evidence check with signed responses, lots mirror + NFT metadata, tx indexer (EVENT_JSON → ledger + notifications, `get_lots` reconcile), payments + accountant CSV, farm-input listings/orders, NEAR Intents 1Click proxy (ported from the `pratala-web3` prototype), stats, Swagger at `/api/docs`. Docs `PAYMENTS.md`, `INTENTS.md`, `AI-VERIFICATION.md`.
- **Frontend** (Next.js 16.4, Tailwind v4, shadcn, TanStack Query): routes `/`, `/market`, `/lot/[id]` (pay link, JSON-LD, OG image), `/checkout/[id]` (pUSDC live + Intents dry quote), `/receipt/[txHash]`, `/onboarding`, `/farmer`, `/farmer/new`, `/verify`, `/portfolio`, `/supplier`, `/exports`, `/admin`, `/faucet`, `/activity`; NEAR Connect provider with function-call-key plugin; Hallmark custom theme (`tokens.css`). Docs `DESIGN.md`, `WALLETS.md`.
- **Scripts & CI**: `scripts/00`–`05` (toolchain, skills, accounts, deploy, seed, verify), GitHub workflows for contracts, backend, frontend, scripts. Docs `ARCHITECTURE.md`, `DISCLOSURE.md`, `DEMO-SCRIPT.md`, `SUBMISSION.md`.

### Fixed
- `make build` silently skipped builds (pattern rules ignored for `.PHONY` targets) (`e0c7720`).
