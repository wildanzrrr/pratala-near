# Pratala API

Off-chain service for Pratala: NEP-413 sign-in, profiles, plots, evidence photos, NEAR AI evidence checks, a Postgres mirror of the lots contract, the payment ledger with CSV export, notifications, the farm-input marketplace and the NEAR Intents 1Click proxy.

The chain is the source of truth. This service only **reads** NEAR (RPC view calls and transaction status) and never signs or sends transactions. The web app reads chain state directly and still works when this API is down.

Stack: NestJS 12 (ESM), Prisma 7.10.1 with `@prisma/adapter-pg`, Postgres 16, near-api-js 7.4.0, `openai` 7.53.0 (NEAR AI Cloud), Vitest, oxlint.

## Run with Docker (API + Postgres)

From the repository root:

```bash
cp backend/.env.example backend/.env     # optional; defaults boot without it
docker compose up -d --build
curl -s localhost:4100/api/health
```

Expected (before the contracts are deployed):

```json
{"ok":true,"db":"ok","chain":{"network":"testnet","rpc":"ok","lotsContract":"missing","pusdcContract":"missing",...},"ai":{"configured":false,"model":"Qwen/Qwen3-VL-30B-A3B-Instruct","tier":"private-tee"},...}
```

The container runs `prisma migrate deploy` and then starts the API on port **4100**. Postgres is exposed on host port **5433**. Uploads live in the `uploads` volume. Optional demo listings: `docker compose exec api node dist/seed/run.js` (or set `SEED_DEMO=true`). Stop with `docker compose down` (add `-v` to delete data).

If `JWT_SECRET` is not set, the API generates a random one at boot and logs a warning: sessions then reset whenever it restarts.

## Run locally (Node 24, pnpm 12)

```bash
cd backend
cp .env.example .env
docker compose -f ../docker-compose.yml up -d postgres
pnpm install                 # also runs prisma generate
pnpm db:deploy               # apply migrations
pnpm db:seed                 # 3 demo farm-input listings
pnpm start:dev               # http://localhost:4100/api, Swagger at /api/docs
```

## Checks

```bash
pnpm lint          # oxlint (type-aware)
pnpm typecheck     # tsc --noEmit
pnpm test          # unit: decimalToBaseUnits, CSV + money format, EVENT_JSON parser + ledger projections, plotHash, AI parser, AI service (openai mocked)
pnpm test:e2e      # supertest against the compose Postgres; NEAR RPC replaced by an in-memory fake, no network
pnpm build
```

E2E needs Postgres running and migrated (`docker compose up -d postgres && pnpm db:deploy`). It signs a NEP-413 payload with a freshly generated ed25519 `KeyPair` and mocks only the RPC access-key lookup.

## Environment

All variables are listed with comments in [`.env.example`](.env.example) and validated with zod at boot (`src/config/env.ts`).

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | (required) | Postgres URL |
| `PORT` | `4100` | HTTP port |
| `JWT_SECRET` | random per process | Signs the `pratala_session` cookie |
| `AUTH_RECIPIENT` / `AUTH_MESSAGE` | `lots.pratala.testnet` / `Sign in to Pratala` | NEP-413 payload fields |
| `NEAR_NETWORK`, `NEAR_RPC_URL` | `testnet`, `https://test.rpc.fastnear.com` | Chain |
| `LOTS_CONTRACT_ID`, `PUSDC_CONTRACT_ID` | `lots.pratala.testnet`, `pusdc.pratala.testnet` | Contracts (see `deploy/testnet.json`) |
| `EXPLORER_BASE` | `https://testnet.nearblocks.io` | Explorer links (`/txns/<hash>`) |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | CORS origin(s), comma-separated, credentials on |
| `PUBLIC_API_URL` | `http://localhost:4100` | Base for evidence URIs; `https://` makes the cookie `Secure` |
| `GCS_BUCKET`, `GCS_KEY_FILE` | — | **Required.** Google Cloud Storage bucket for evidence photos (no local fallback); `GCS_KEY_FILE` is an optional service-account JSON path, otherwise Application Default Credentials |
| `NEAR_INTENTS_API_KEY`, `NEAR_INTENTS_BASE_URL` | empty, 1Click v0 | Intents proxy |
| `NEAR_AI_API_KEY`, `NEAR_AI_BASE_URL`, `NEAR_AI_VISION_MODEL`, `NEAR_AI_FALLBACK_MODEL` | empty, `https://cloud-api.near.ai/v1`, `Qwen/Qwen3-VL-30B-A3B-Instruct`, `z-ai/glm-5.3-flash` | AI evidence check |
| `INDEXER_POLL_MS` | `30000` | Reconcile `get_lots` into the mirror (0 = off) |

## Endpoints (prefix `/api`)

Full shapes: [`docs/INTERFACES.md` §5](../docs/INTERFACES.md). Interactive docs: `/api/docs`.

| Area | Routes |
| --- | --- |
| Health | `GET /health` |
| Auth (NEP-413) | `POST /auth/challenge`, `POST /auth/verify`, `POST /auth/logout`, `GET /auth/me` |
| Users | `GET/PUT /users/me`, `GET /users/:accountId` |
| Plots | `POST /plots`, `GET /plots/mine`, `GET /plots/:id` |
| Evidence | `POST /evidence` (multipart `file` ≤ 8 MB, `kind`, `lotId?`, `plotId?`), `GET /evidence/:sha256` |
| AI | `POST /ai/check`, `GET /ai/check/:id` |
| Lots | `GET /lots`, `GET /lots/:lotId`, `GET /lots/:lotId/history`, `GET /lots/:lotId/metadata.json` |
| Indexer | `POST /tx` |
| Payments | `GET /payments`, `GET /payments/export.csv` |
| Notifications | `GET /notifications`, `POST /notifications/:id/read` |
| Marketplace | `GET/POST /listings`, `GET/PUT /listings/:id`, `POST /orders`, `POST /orders/:id/confirm`, `GET /orders/mine` |
| Intents | `GET /intents/tokens`, `POST /intents/quote`, `POST /intents/deposit/submit`, `GET /intents/status` |
| Stats | `GET /stats` |

## How the pieces fit

- **Sign-in**: `POST /auth/challenge` stores 32 random bytes (5 min, single use). The wallet signs `{message, recipient, nonce}` (NEP-413). `POST /auth/verify` consumes the challenge, then `verifyMessage` from `near-api-js/nep413` checks the signature and that the key is a full-access key of the account. A JWT goes into the httpOnly, SameSite=Lax cookie `pratala_session`. `GET /auth/me` adds on-chain roles (`get_roles`, cached 60 s; `Admin` = contract owner).
- **Indexer**: the web app calls `POST /tx {txHash, signerId}` after each transaction. The API fetches the transaction with receipts at `FINAL` (`EXPERIMENTAL_tx_status`), parses every `EVENT_JSON:` log from successful receipts of the lots/pUSDC contracts (events from any other account are ignored), and stores them idempotently (unique on `txHash + receiptId + event + index`). From those events it derives payment rows and inbox notifications. A timer also copies `get_lots` into the mirror every `INDEXER_POLL_MS`.
- **Orders**: `POST /orders` returns `memo = "order:<uuid>"` and the exact `ft_transfer` to sign. `POST /orders/:id/confirm {txHash}` checks on-chain that the transaction is a successful pUSDC `ft_transfer` from the buyer to the seller with that amount and memo.
- **Graceful degradation**: with the contracts missing, `/health` reports `missing`, `/lots` returns `[]`, `/stats` counts from the mirror, the reconcile timer logs one warning every 5 minutes, and nothing crash-loops. With no NEAR AI key, `/ai/check` returns 503 `ai_unavailable`.

More: [`docs/PAYMENTS.md`](../docs/PAYMENTS.md), [`docs/INTENTS.md`](../docs/INTENTS.md), [`docs/AI-VERIFICATION.md`](../docs/AI-VERIFICATION.md).
