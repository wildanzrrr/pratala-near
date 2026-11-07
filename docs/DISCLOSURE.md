# Disclosure

This page is for NEAR HACKATHON judges and reviewers. It covers what existed before this repository, what was ported from it, how AI was used, which templates and libraries the code is built on, and which window of work is being judged. The rules say libraries, templates, boilerplate and AI-generated code are allowed if they are listed. Everything we know of is listed here.

## 1. Judged window

- The judged work is **this repository's git history from its first commit**. Run `git log --reverse --format='%h %ad %s' --date=iso | head -5` to see it. The first commit is `58938a3 2026-11-07 chore: scaffold monorepo (README, LICENSE, AGENTS.md, workspace, plan)`.
- Every unit of work is its own commit (contract module, test, API module, route, script, doc). The milestone tags are `v0.1.0-contracts`, `v0.1.0-app`, `v0.1.0` and `hackathon-submission`.
- Nothing from before the hackathon announcement (2026-10-19) is in this repository's history.

## 2. Pre-existing prototype: `pratala-web3`

A small prototype existed before this repo. It was written in late October 2026 (file dates 2026-10-29) and was never committed here. It was a static landing page plus a Node proxy for the NEAR Intents 1Click API.

| File | Lines | What it was |
| --- | ---: | --- |
| `server.mjs` | 209 | Node built-ins only: `GET /api/tokens`, `POST /api/quote`, deposit-hash submit, status polling against `https://1click.chaindefuser.com/v0`; static file server on `127.0.0.1:4178` |
| `public/index.html` | 171 | English landing page: hero, marketplace demo listings, 3-step verification concept, quote form |
| `public/app.js` | 333 | Client-side filters, `localStorage` listing drafts, quote form |
| `public/styles.css` | 19 | Palette and layout (minified) |
| `test/smoke.test.mjs` | 72 | `node --test` smoke tests |

The prototype had **no smart contracts, no wallet connection, no transaction signing, no database, no accounts and no on-chain harvest token**. Its own README says so ("The current app does not connect a wallet or sign transactions … no … on-chain harvest token").

### What was ported into this repo

| Item | From | To | Changes |
| --- | --- | --- | --- |
| `decimalToBaseUnits(value, decimals)` (BigInt decimal → token base units) | `server.mjs` | `backend/` intents module | Logic kept verbatim; typed for TypeScript |
| 1Click quote payload shape (`swapType: EXACT_INPUT`, `depositType: ORIGIN_CHAIN`, `recipientType: DESTINATION_CHAIN`, `refundType: ORIGIN_CHAIN`, default slippage 100 bps, 10-minute deadline) and the tokens / quote / deposit-submit / status routes | `server.mjs` | `backend/` intents module, `GET/POST /api/intents/*` | `dry` now defaults to **`true`** (the prototype sent `dry: false`); responses cached and rate-limited |
| Page copy and information architecture ("A simpler route from farm to buyer", "Start with the trade", "Start with evidence") | `public/index.html` | `frontend/` landing page | Rewritten in Bahasa Indonesia first, with English toggle |
| Three-step verification concept: 01 Field visit (grower, field agent) → 02 Local review (co-op, farmer group) → 03 Weigh-in at delivery (warehouse, buyer) | `public/index.html` | the on-chain lot state machine (`attest_field` → `attest_coop` → `weigh_in`) and the UI stepper | In the prototype it was product copy only. Here it is enforced by the contract. |
| Palette: paper `#f4f6ef`, ink `#18241d`, green `#1f6a42`, lime `#d8ef81`, line `#dce3d8` | `public/styles.css` | `frontend/` design tokens (`--pt-*`) | Used as the anchor for the tuned theme |
| Hero photo `rice-field.jpg` | `public/images/` | `frontend/public/` | Photo by [Redicul Pict on Unsplash](https://unsplash.com/photos/a-group-of-people-working-in-a-rice-field-73H3_OSyWOM), Unsplash License, credited on the page |

The "To" column says where each item is meant to land. Before submission, check each one against the final tree. All other code is new in this repository: the contracts, tests, wallet integration, backend modules, database schema, frontend app, scripts and CI.

## 3. AI assistance

Most of the code and docs were written by AI coding agents, with the human owner directing, reviewing and approving. The human approved every network-changing action: account creation, deploys and transactions.

- **Tools:** Claude Code (Anthropic CLI), running **Claude Opus 5.5** and **Claude Fable 5.1**. Several agents worked in parallel, one per folder, coordinated through [`AGENTS.md`](../AGENTS.md), [`INTERFACES.md`](INTERFACES.md) and [`PLAN.md`](PLAN.md).
- **Attribution:** AI-authored commits carry a `Co-Authored-By: Claude …` trailer. Run `git log --format='%h %s%n%b' | grep -B1 Co-Authored-By` to list them.
- **Areas written mainly by AI:**
  - `smart-contract/`: `harvest-lot` and `pusdc` contracts, unit tests, sandbox integration tests, Makefile
  - `backend/`: NestJS modules (auth NEP-413, users, plots, evidence, AI check, lots mirror, indexer, payments + CSV, intents proxy, notifications, listings/orders), Prisma schema and migrations, tests, Dockerfile
  - `frontend/`: routes, components, hooks, providers, i18n strings, design tokens
  - `scripts/` (toolchain, skills, accounts, deploy, seed, verify), `.github/workflows/`, `deploy/testnet.json.example`
  - `docs/` (this file, architecture, demo script, submission checklist, and the others), `README.md`
- **Runtime AI** is a product feature, not a code-generation tool. The backend calls NEAR AI Cloud for the advisory evidence check. See `docs/AI-VERIFICATION.md`.

## 4. Templates and boilerplate

| Template / pattern | Used for |
| --- | --- |
| `@nestjs/cli` (`nest new`) scaffold | `backend/` project skeleton |
| `create-next-app` (Next.js 16 App Router) / `create-near-app --frontend next-app` wiring | `frontend/` project skeleton, NEAR Connect setup |
| shadcn/ui (`shadcn` CLI) generated components | `frontend/components/ui/*` |
| [near-examples/FT](https://github.com/near-examples/FT) pattern | `smart-contract/contracts/pusdc` (NEP-141 + NEP-145 on `near-contract-standards`), plus `faucet` and `mint` |
| [near-examples/NFT](https://github.com/near-examples/NFT) pattern | `smart-contract/contracts/harvest-lot` NEP-171/177/181 core (hand-written `impl` delegating to `NonFungibleToken`) |
| near-sdk docs integration-test layout (`near-sandbox` + `near-api` + `cargo-near-build`) | `smart-contract/contracts/harvest-lot/tests` |
| Hallmark design skill (theme tokens + landing layout) | `frontend/tokens.css`, landing page (if used, logged in `frontend/.hallmark/`) |

## 5. Libraries

> **Update before submission.** The tables below were generated from the manifests present on 2026-11-07, while the packages were still being scaffolded. Before tagging `hackathon-submission`, regenerate them from `smart-contract/**/Cargo.toml`, `backend/package.json` and `frontend/package.json` and fill in the "Pending" section.

### Rust (`smart-contract/`)

| Crate | Version | Use |
| --- | --- | --- |
| `near-sdk` | 5.30.1 | contract runtime |
| `near-contract-standards` | 5.30.1 | NEP-141/145 (pUSDC), NEP-171/177/181 (lots) |
| `near-sandbox` | 0.4.0 (dev) | local sandbox node for integration tests |
| `near-api` | 0.8.7 (dev) | test client |
| `cargo-near-build` | 0.11.5 (dev) | builds wasm inside tests |
| `tokio` | 1.41 (dev) | async test runtime |
| `testresult` | 0.4.1 (dev) | test ergonomics |
| `anyhow` | 1.0 (dev) | test errors |
| toolchain | Rust 1.95.0, cargo-near 0.23.0, near-cli-rs 0.31.1 | build, deploy, scripts |

### Backend (`backend/package.json`)

| Package | Version | Use |
| --- | --- | --- |
| `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` | ^12.0.1 | framework |
| `@nestjs/config` | 12.1.1 | env config |
| `@nestjs/jwt` | 12.0.4 | session cookie JWT |
| `@nestjs/schedule` | 12.0.3 | indexer reconcile loop |
| `@nestjs/swagger` | 12.1.1 | OpenAPI docs |
| `@nestjs/throttler` | 6.7.1 | rate limiting (intents, AI) |
| `@prisma/client`, `@prisma/adapter-pg`, `prisma` | 7.10.1 | ORM, migrations |
| `pg` | ^8.23.1 | Postgres driver |
| `near-api-js` | 7.4.0 | RPC reads, NEP-413 `verifyMessage` |
| `openai` | 7.53.0 | OpenAI-compatible client for NEAR AI Cloud |
| `exifr` | 7.1.3 | photo EXIF GPS/time |
| `multer` | ^2.5.0 | multipart uploads |
| `helmet` | 8.3.0 | security headers |
| `cookie-parser` | 1.4.7 | session cookie |
| `zod` | 4.6.7 | validation |
| `rxjs`, `reflect-metadata` | ^7.8.1, ^0.2.2 | Nest runtime |
| dev: `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/testing`, `typescript` ^6.0.2, `vitest` ^4.1.2, `@vitest/coverage-v8`, `vite` ^8, `supertest` ^7, `oxlint` ^1.58 + `oxlint-tsgolint`, `prettier` ^3.4.2, `tsx`, `dotenv`, `source-map-support`, `@types/*` | | build, test, lint |

### Frontend (`frontend/package.json`)

| Package | Version | Use |
| --- | --- | --- |
| `next` | 16.4.5 | App Router framework |
| `react`, `react-dom` | 19.3.0 | UI |
| `@hot-labs/near-connect` | ^0.12.0 | wallet selector (HOT, Meteor, MyNearWallet, …) |
| `function-call-key-plugin` | ^2.2.0 | function-call access keys for popup-free verifier/farmer actions |
| `near-api-js` | ^7.4.0 | RPC views, transaction building |
| `@tanstack/react-query` | ^5.107.1 | data fetching / cache |
| `react-hook-form`, `@hookform/resolvers`, `zod` | ^7.91.0, ^7.0.3, ^4.6.7 | forms + validation |
| `radix-ui`, `shadcn`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, `vaul`, `sonner`, `next-themes` | see manifest | shadcn/ui component stack |
| `@phosphor-icons/react` | ^2.1.10 | icons |
| `cn` | ^0.5.2 | class-name helper |
| dev: `tailwindcss` ^4 + `@tailwindcss/turbopack`, `eslint` ^9 + `eslint-config-next` 16.4.5, `typescript` ^5, `@types/*` | | styling, lint, types |

### Pending (fill in before submission)

- [ ] Any packages added after 2026-11-07 (e.g. `near-connect-hooks`, map or QR libraries), with versions from the final lockfiles
- [ ] Fonts (e.g. Geist) and their license
- [ ] Any further images or icons beyond the credited Unsplash hero photo
- [ ] Whether Hallmark generated `frontend/tokens.css`. If so, link `frontend/.hallmark/log.json`
- [ ] The NEAR AI Cloud model actually used (id and tier: TEE or not), copied from `backend/.env.example` / `docs/AI-VERIFICATION.md`

## 6. External services

| Service | Network | Use |
| --- | --- | --- |
| NEAR testnet RPC (`test.rpc.fastnear.com`, archival `archival-rpc.testnet.fastnear.com`) | testnet | all chain reads and writes |
| NEAR testnet faucet (near-cli-rs `sponsor-by-faucet-service`) | testnet | demo accounts |
| testnet.nearblocks.io | testnet | explorer links |
| NEAR AI Cloud (`cloud-api.near.ai/v1`) | — | advisory AI evidence check, signed responses |
| NEAR Intents 1Click (`1click.chaindefuser.com/v0`) | **mainnet**, `dry: true` quotes only | cross-chain checkout preview |

## 7. Agent skills used during development

Agent skills are instruction packs for the coding agents. They are pinned per folder in `skills-lock.json` and restored with `scripts/01-install-skills.sh`.

| Folder | Source repo → skills |
| --- | --- |
| `smart-contract/` | `near/agent-skills` → near-cli-rs, near-contract-audit, near-smart-contracts |
| `backend/` | `near/agent-skills` → near-ai-cloud, near-api-js, near-intents · `kadajett/agent-nestjs-skills` → nestjs-best-practices · `jeffallan/claude-skills` → nestjs-expert · `prisma/skills` → prisma-cli, prisma-client-api, prisma-database-setup, prisma-orm-setup, prisma-postgres |
| `frontend/` | `vercel-labs/agent-skills` → vercel-react-best-practices, vercel-composition-patterns · `shadcn/ui` → shadcn · `wshobson/agents` → tailwind-design-system · `deckardger/tanstack-agent-skills` → tanstack-query-best-practices · `sanity-io/agent-toolkit` → seo-aeo-best-practices · `leonxlnx/taste-skill` → design-taste-frontend · `pbakaus/impeccable` → impeccable · `near/agent-skills` → near-dapp, near-api-js, near-intents (present in `frontend/.claude/skills/` on 2026-11-07 but not yet in `frontend/skills-lock.json`; re-check at submission, along with `nearbuilders/near-skills` → near-connect-hooks from PLAN §8) |

## 8. Other projects

> **Confirm before submission.** If anyone on the team enters a second NEAR HACKATHON project, the rules require each README to name the other project. Write the answer here: "none", or the other repo's link.
