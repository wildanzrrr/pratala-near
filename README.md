# Pratala — verified harvest lots on NEAR

> Built at the NEAR HACKATHON (Nov 1–14, 2026). Tracks: Real-World Money · NFTs That Do Something · Open Innovation (the TEE-attested AI check also fits Privacy & Private AI).
> **Live on NEAR mainnet** — app <https://pratala.xyz> · contract `lots.pratala.near` · API <https://api.pratala.xyz/api> · repo <https://github.com/wildanzrrr/pratala-near>.

Pratala is a marketplace where an Indonesian farmer sells a harvest **before** it is harvested, without a middleman. Today a smallholder sells at the warehouse gate at the middleman's price, often after borrowing from that same middleman all season. Pratala lets a buyer pre-fund the harvest directly: the farmer registers a projection (crop, kilos, price per kilo) which mints a NEP-171 NFT; three independent attestations — field agent visit, cooperative review, warehouse weigh-in — act as the oracle; buyers fund it **by the kilogram** with USDC and receive share NFTs; the USDC sits in escrow inside the lot contract. At weigh-in the contract settles: the farmer is paid for what was delivered, the platform takes 2%, and any shortfall is refunded **to whoever holds the share NFTs at that moment**.

Worked example used everywhere in this repo (tests, docs, seed data): 1,000 kg rice at 0.45 USDC/kg — buyer1 takes 700 kg (315 USDC), investor2 the last 300 kg (135 USDC), each receiving a share NFT. Weigh-in 900 kg, fee 2% → farmer 396.90, treasury 8.10, and the 45.00 shortfall refund splits pro-rata across the shares: 31.50 to the 700 kg share, 13.50 to the 300 kg share. These exact numbers are asserted by the sandbox test suite (`smart-contract/contracts/harvest-lot/tests/`).

## Live right now

| What | Where | Do this → see this |
| --- | --- | --- |
| Web app | <https://pratala.xyz> | open it → landing loads; **Sign in** → NEAR Connect sheet lists HOT, Meteor, … |
| API | <https://api.pratala.xyz/api/health> | `curl -s https://api.pratala.xyz/api/health` → `{"ok":true,"db":"ok","chain":{"network":"mainnet",…}}` |
| Contract config | `lots.pratala.near` | RPC `get_config` (below) → `{"owner_id":"pratala.near","usdc_contract":"172086…33a1","treasury":"treasury.pratala.near","fee_bps":200,…}` |
| Deploy tx | [`Ai8bdQk…`](https://nearblocks.io/tx/Ai8bdQkQHancF8VW4ALkjm58rEJvokV7ZeXzBt9peh1r) | open on nearblocks → `Deploy Contract` to `lots.pratala.near` |
| Demo post (video) | X post URL | added at submission |

Contract config, copy-paste (no toolchain needed):

```bash
curl -s -X POST https://rpc.fastnear.com -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":"view","method":"query","params":{"request_type":"call_function","finality":"final","account_id":"lots.pratala.near","method_name":"get_config","args_base64":"e30="}}'
# result.result (base64 of): {"owner_id":"pratala.near","usdc_contract":"17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1","treasury":"treasury.pratala.near","fee_bps":200,"paused":false,"total_lots":0}
```

The escrow token is **native USDC on mainnet** (`17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`, 6 decimals — deliberately not wUSDC).

## Try the hosted app (5 minutes, no local setup)

1. Open <https://pratala.xyz> → the landing page renders in English with the 1,000 kg worked example.
2. **Sign in** → NEAR Connect sheet → pick HOT or Meteor → connect → the header shows your account id. `/portfolio` reads your NFTs straight from the chain. (Email/Google SSO shows "Temporarily unavailable": the NEAR Auth production client id is not issued yet — wallet sign-in is unaffected.)
3. `/market` lists lots as farmers list them. Mainnet launch state: the marketplace may be empty — listing a lot needs the 0.3 NEAR deposit and the full lifecycle needs role-holding attestor accounts, so the end-to-end farmer→buyer flow is shown in the demo video attached to the X post and reproduced by the sandbox tests and scripts below.
4. Registering, funding and claims move **real USDC** on mainnet: a funded purchase is a single `ft_transfer_call` into the lot contract and mints a share NFT to the buyer; every tx links to nearblocks in the UI.
5. Cross-chain checkout: on a lot's checkout tab, "Other chains" returns a **live NEAR Intents 1Click dry quote** (e.g. 360 USDC on Base → ≈359.96 USDC on NEAR). Quotes are mainnet `dry: true` — Intents has no testnet, so no funds move from the quote UI.

## Verify the money math

```bash
make -C smart-contract test   # → 79 unit tests + 10 sandbox tests, all "test result: ok", 0 failed
```

The sandbox suite asserts the settlement arithmetic end-to-end — e.g. `two_buyers_split_the_harvest_and_escrow_pro_rata`, `partial_close_settles_the_sold_kg_only`, `excess_funding_is_refunded` (`smart-contract/contracts/harvest-lot/tests/`). Money details: 2% platform fee (200 bps, frozen at first sale), 0.3 NEAR `register_lot` deposit (pre-pays NFT storage), ≤ 32 share NFTs per lot, pull-based claims (farmer / each share holder / treasury claim their exact part), `claim_lock` freezes share transfers while a payout is in flight.

**How the NFT carries money and control** (`docs/NFT-CONTROL.md`): the lot certificate NFT stays with the farmer; each purchase mints a transferable share NFT for the kilograms bought. The refund entitlement is not a database row — it belongs to whoever owns the share NFT when it is claimed, so buying, gifting or trading a share transfers the claim with it.

## Repository

| Folder | What | Docs |
| --- | --- | --- |
| [`smart-contract/`](smart-contract/) | Rust (near-sdk 5.30.1): `harvest-lot` (NEP-171 lot + share NFTs, USDC escrow, pull claims) and `pusdc` (NEP-141 test stablecoin used on testnet) | [CONTRACTS](docs/CONTRACTS.md) · [NFT-CONTROL](docs/NFT-CONTROL.md) |
| [`backend/`](backend/) | NestJS 12 + Prisma 7 + Postgres: NEP-413 wallet login, evidence uploads (GCS, EXIF), NEAR AI Cloud evidence check (TEE model), tx indexer → payments ledger + CSV, NEAR Intents 1Click proxy, NEAR Auth email-SSO relaying | [PAYMENTS](docs/PAYMENTS.md) · [AI-VERIFICATION](docs/AI-VERIFICATION.md) · [INTENTS](docs/INTENTS.md) |
| [`frontend/`](frontend/) | Next.js 16 App Router: farmer, verifier, buyer, supplier and admin flows; NEAR Connect wallets (HOT, Meteor, …) with function-call keys | [WALLETS](docs/WALLETS.md) · [DESIGN](docs/DESIGN.md) |
| [`scripts/`](scripts/) | Toolchain, skills, accounts, deploy (testnet + mainnet), seed, verify | [scripts/README](scripts/README.md) |
| [`docs/`](docs/) | [ARCHITECTURE](docs/ARCHITECTURE.md) · [INTERFACES](docs/INTERFACES.md) · [DISCLOSURE](docs/DISCLOSURE.md) · [DEMO-SCRIPT](docs/DEMO-SCRIPT.md) · [SUBMISSION](docs/SUBMISSION.md) · [PLAN](docs/PLAN.md) | |

## Run it locally

Prerequisites: Rust 1.95 + `wasm32-unknown-unknown`, `cargo-near` 0.23, `near` CLI 0.31, Node 24, pnpm, Docker, jq. Check them all:

```bash
CHECK_ONLY=1 scripts/00-install-toolchain.sh
```

Contracts — build and test (no network needed):

```bash
make -C smart-contract build   # → smart-contract/target/near/{harvest_lot,pusdc}/*.wasm
make -C smart-contract test    # expect: all "test result: ok", 0 failed
```

Backend + database (API on port 4100). Postgres is external — your own instance on `localhost:5432`; evidence storage is GCS-only by design, so you need any GCS bucket you control (no local fallback):

```bash
cp backend/.env.example backend/.env   # set DATABASE_URL; set GCS_BUCKET (+ GCS_KEY_FILE or Application Default Credentials)
pnpm -C backend db:deploy              # apply migrations
pnpm -C backend start:dev              # or: docker compose up -d --build (DATABASE_URL host → host.docker.internal)
curl -s localhost:4100/api/health      # expect: {"ok":true,"db":"ok",...}
```

Frontend (port 3000). The `.env.example` defaults point at the testnet walkthrough; to run against the live mainnet contract, replace the network block (all values are public):

```bash
cp frontend/.env.example frontend/.env.local
cat >> frontend/.env.local <<'EOF'
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_RPC_URL=https://rpc.fastnear.com
NEXT_PUBLIC_LOTS_CONTRACT_ID=lots.pratala.near
NEXT_PUBLIC_PUSDC_CONTRACT_ID=17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1
NEXT_PUBLIC_EXPLORER_BASE=https://nearblocks.io
NEXT_PUBLIC_AUTH_RECIPIENT=lots.pratala.near
NEXT_PUBLIC_FASTAUTH_CONTRACT_ID=fast-auth.near
NEXT_PUBLIC_FASTAUTH_MPC_CONTRACT_ID=v1.signer
NEXT_PUBLIC_FASTAUTH_AUTH0_DOMAIN=login.auth.near.org
NEXT_PUBLIC_FASTAUTH_API_AUDIENCE=https://api.auth.near.org
NEXT_PUBLIC_SSO_ACCOUNT_ROOT=sponsor.pratala.near
EOF
pnpm -C frontend install && pnpm -C frontend dev   # → http://localhost:3000 renders against mainnet
```

With `NEXT_PUBLIC_NEAR_NETWORK=mainnet` the app hard-fails at build if any value still says "testnet" (no silent cross-network fallbacks), so replace the whole block. Set `NEXT_PUBLIC_DEMO_FIXTURES=1` to preview the UI with three labelled sample lots instead of chain data.

## Deployments

**Mainnet (current, fractional contract).** Owner `pratala.near`, contract `lots.pratala.near` (wasm sha256 `d1969cfd…`, 392,588 B, deploy tx [`Ai8bdQk…`](https://nearblocks.io/tx/Ai8bdQkQHancF8VW4ALkjm58rEJvokV7ZeXzBt9peh1r)), treasury `treasury.pratala.near`, attestor roles on `agent`/`coop`/`warehouse.pratala.near`, lots + treasury registered on native USDC. Full record with every tx hash: [`deploy/mainnet.json`](deploy/mainnet.json); reproduced by `scripts/06-mainnet-accounts.sh` + `scripts/07-mainnet-deploy.sh` (needs the owner key).

**Testnet (superseded, whole-lot model).** `lots.pratala.testnet` + `pusdc.pratala.testnet` hold the earlier demo lots (lot-1 Settled with claims paid, lot-2 Settled with 352.80 / 7.20 claims pending, lot-3 FieldVerified) — the fractional redesign shipped as a fresh mainnet deploy because the stored lot shape changed. `scripts/02–05` walk a fresh fractional `lots-v2.pratala.testnet` deploy + seed + verify; `deploy/testnet.json` records ids, accounts and tx hashes.

## For hackathon judges

- **Judged window** — this repository's full history from its first commit, one commit per unit of work, each carrying a `Co-Authored-By: Claude` trailer where AI authored it:
  `git log --reverse --format='%h %ad %s' --date=iso | head -3` → `58938a3 2026-11-07 chore: scaffold monorepo …`. Tags: `v0.1.0-contracts` … `hackathon-submission`.
- **Disclosure** — pre-existing prototype (`pratala-web3`, what was ported), AI assistance, templates and libraries with versions: [`docs/DISCLOSURE.md`](docs/DISCLOSURE.md). Nothing before the 2026-10-19 announcement is in this history.
- **Tracks** — Real-World Money (stablecoin escrow, paid/pending/refunded ledger, bookkeeper CSV) · NFTs That Do Something (share NFTs carry escrow claims; control passes on transfer; `claim_lock`) · Open Innovation (smallholder finance without middlemen); the advisory evidence check runs a **TEE-tier** NEAR AI Cloud model (`Qwen/Qwen3-VL-30B-A3B-Instruct`, `private-tee` in the health endpoint) — only the photo hash and the signed verdict are stored.
- **Limitations** — attestor roles are owner-granted allowlists; the AI evidence check is advisory (a human coop still approves); 1Click quotes are mainnet `dry: true` only; no legal/RWA compliance review; state is mainnet-live, so end-to-end plays involve real (small) amounts.

## License

MIT — see [`LICENSE`](LICENSE).
