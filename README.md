# Pratala — verified harvest lots on NEAR

> Built at the NEAR HACKATHON (Nov 1–14, 2026). Tracks: Real-World Money · NFTs That Do Something · Open Innovation.
> Status: code complete and tested locally; **testnet deployment pending** (contract ids and the 5-minute judge walkthrough land in this README after deploy).

Pratala lets an Indonesian farmer turn a verified harvest projection into a NEAR NFT that holds stablecoin escrow. A buyer funds it with pUSDC on testnet (in production: from any chain through NEAR Intents). Three independent attestations — field agent, cooperative, warehouse weigh-in — act as the oracle. The weigh-in settles the escrow: the farmer is paid for what was delivered, the platform takes its fee, and any under-delivery is refunded to **whoever holds the NFT at that moment**.

Worked example used everywhere in this repo: 1,000 kg rice at 0.45 pUSDC/kg = 450 pUSDC escrow. Weigh-in 900 kg, fee 2% → farmer 396.90, treasury 8.10, NFT holder refund 45.00.

## Repository

| Folder | What | Docs |
| --- | --- | --- |
| [`smart-contract/`](smart-contract/) | Rust (near-sdk 5.30.1): `harvest-lot` (NEP-171 NFT + escrow, pull-based claims) and `pusdc` (NEP-141 test stablecoin with capped faucet) | [CONTRACTS](docs/CONTRACTS.md) · [NFT-CONTROL](docs/NFT-CONTROL.md) |
| [`backend/`](backend/) | NestJS 12 + Prisma 7 + Postgres, Docker: NEP-413 wallet login **and email SSO (NEAR Auth)**, sponsor wallet that creates + gas-seeds farmer accounts, evidence uploads, NEAR AI Cloud evidence check (TEE model), tx indexer, payments ledger + CSV, NEAR Intents 1Click proxy | [PAYMENTS](docs/PAYMENTS.md) · [AI-VERIFICATION](docs/AI-VERIFICATION.md) · [INTENTS](docs/INTENTS.md) |
| [`frontend/`](frontend/) | Next.js 16 App Router (Vercel): farmer, verifier, buyer, supplier and admin flows; **sign in with email or Google → non-custodial MPC account, platform-paid gas and deposits**, NEAR Connect wallets (HOT, Meteor, …) for existing accounts | [WALLETS](docs/WALLETS.md) · [DESIGN](docs/DESIGN.md) |
| [`scripts/`](scripts/) | Toolchain, skills, testnet accounts, deploy, seed, verify | [scripts/README](scripts/README.md) |
| [`docs/`](docs/) | [ARCHITECTURE](docs/ARCHITECTURE.md) · [INTERFACES](docs/INTERFACES.md) · [DISCLOSURE](docs/DISCLOSURE.md) · [DEMO-SCRIPT](docs/DEMO-SCRIPT.md) · [SUBMISSION](docs/SUBMISSION.md) · [PLAN](docs/PLAN.md) | |

## Run it locally

Prerequisites: Rust 1.95 + `wasm32-unknown-unknown`, `cargo-near` 0.23, `near` CLI 0.31, Node 24, pnpm, Docker, jq. Check them all:

```bash
CHECK_ONLY=1 scripts/00-install-toolchain.sh
```

Contracts — build and run the 69 unit + sandbox tests:

```bash
make -C smart-contract build   # → smart-contract/target/near/{harvest_lot,pusdc}/*.wasm
make -C smart-contract test    # expect: all "test result: ok", 0 failed
```

Backend + database (API on port 4100, Postgres on 5433):

```bash
cp backend/.env.example backend/.env
docker compose up -d --build
curl -s localhost:4100/api/health   # expect: {"ok":true,"db":"ok",...}
```

Frontend (port 3000):

```bash
cp frontend/.env.example frontend/.env.local
pnpm -C frontend install && pnpm -C frontend dev
```

Until the contracts are deployed, pages show "Contracts not deployed yet". Set `NEXT_PUBLIC_DEMO_FIXTURES=1` in `frontend/.env.local` to preview the UI with three sample lots labelled "Sample".

**Email sign-in (no wallet needed).** With the API running, open http://localhost:3000 → "Sign in" → **Continue with email or Google** → create any account in the login window → expect: you return signed in as `u… sponsor.pratala.testnet`, and on testnet the account is created and funded with 0.5 NEAR by the platform sponsor (see the tx on [nearblocks](https://testnet.nearblocks.io)) — no seed phrase, no gas to buy. The sponsor wallet must be configured (`SPONSOR_ACCOUNT_ID` + `SPONSOR_PRIVATE_KEY_FILE` in `backend/.env`, key at `config/keys/sponsor.pratala.testnet.json`); without it the button fails fast with `sponsor_unconfigured`.

## Deploy to testnet (requires approval — changes chain state)

```bash
scripts/02-create-accounts.sh   # pratala.testnet + lots./pusdc. sub-accounts + demo actors
scripts/03-deploy-contracts.sh  # build, deploy, init; writes deploy/testnet.json
scripts/04-seed-demo.sh         # lot-1 full lifecycle, lot-2 Listed, lot-3 FieldVerified
scripts/05-verify-demo.sh       # read-only; asserts 396.90 / 8.10 / 45.00 and NFT holder
```

## Disclosure

This repo was started on 2026-11-07 during the hackathon. It ports small parts of an earlier prototype (`pratala-web3`) and was written with AI assistance (Claude Code). Details, templates and libraries: [docs/DISCLOSURE.md](docs/DISCLOSURE.md).

## License

MIT — see [`LICENSE`](LICENSE).
