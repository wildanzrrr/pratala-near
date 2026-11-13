# Pratala web

Next.js 16.4 (App Router, Cache Components) · React 19 · Tailwind v4 · shadcn/ui · TanStack Query · NEAR Connect 0.12 + function-call-key-plugin 2.2 · near-api-js 7.4. English-only UI; all copy lives in `lib/i18n/en.ts`.

Reads chain state directly over JSON-RPC; uses the backend (`../backend`, port 4100) only for evidence, AI checks, history, payments, notifications and profiles. Every page renders with the backend down and with the contracts not yet deployed.

## Run it

Requires Node ≥ 24 and pnpm.

```bash
cd frontend
pnpm install
cp .env.example .env.local        # testnet defaults from docs/INTERFACES.md
pnpm dev
```

→ open http://localhost:3000 — the landing page renders; the stats strip shows "—" and *"Contracts not deployed yet"* until the contracts exist.

**Review the design before deploy** (labelled sample data, never mixed with chain data):

```bash
NEXT_PUBLIC_DEMO_FIXTURES=1 pnpm dev
```

→ `/market` lists three lots stamped **Sample**; `/lot/lot-3` shows a settled lot (396.90 / 45.00 / 8.10 USDC split).

## Checks

```bash
pnpm lint        # eslint (next core-web-vitals + typescript)
pnpm typecheck   # next typegen && tsc --noEmit
pnpm build       # production build — all routes
```

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_NEAR_NETWORK` | `testnet` | NEAR Connect + plugin network |
| `NEXT_PUBLIC_RPC_URL` | `https://test.rpc.fastnear.com` | All view calls |
| `NEXT_PUBLIC_LOTS_CONTRACT_ID` | `lots.pratala.testnet` | harvest-lot contract; also the FC-key contract |
| `NEXT_PUBLIC_PUSDC_CONTRACT_ID` | `pusdc.pratala.testnet` | USDC escrow token (NEP-141; real USDC on mainnet) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4100/api` | Backend |
| `NEXT_PUBLIC_EXPLORER_BASE` | `https://testnet.nearblocks.io` | "View proof" links |
| `NEXT_PUBLIC_AUTH_RECIPIENT` | `lots.pratala.testnet` | NEP-413 recipient (informational; the backend issues it) |
| `NEXT_PUBLIC_DEMO_IDR_RATE` | `18000` | "≈ Rp" conversion, always labelled *demo rate* |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Canonical URLs, sitemap, OG |
| `NEXT_PUBLIC_DEMO_FIXTURES` | `0` | `1` = sample lots from `lib/fixtures.ts` |

Validated once in `lib/env.ts`; after deploy, copy ids from `deploy/testnet.json`.

## Routes

`/` landing · `/market` · `/lot/[id]` (pay link, JSON-LD, OG image) · `/checkout/[id]` (USDC live · NEAR Intents dry quote) · `/receipt/[txHash]` · `/onboarding` · `/farmer` · `/farmer/new` · `/verify` · `/portfolio` · `/supplier` · `/exports` · `/admin` · `/activity` · `robots.txt` · `sitemap.xml`. Screen-by-screen notes: [`../docs/DESIGN.md`](../docs/DESIGN.md).

## Try the flow (after contracts are deployed)

1. **Sign in** — click *Sign in* → choose **Meteor** (or HOT Wallet) → approve once. → The account menu shows *Automatic signing on* (a function-call key for the lots contract now exists). Email SSO shows as *Temporarily unavailable* until `NEXT_PUBLIC_FASTAUTH_CLIENT_ID` is set.
2. **Fund a lot** — `/market` → a lot marked *Open for funding* → *Fund this harvest* → *Pay 450.00 USDC* → wallet approval. → `/receipt/<hash>` shows *Succeeded*, `lot_funded`; the lot page shows *Held by the contract* and you as holder.
3. **Verify without popups** — with a FieldAgent / Coop / Warehouse account, `/verify` → open a task → take a photo → sign. → Toast *Verification recorded* with *View proof*; no wallet window.
4. **Money out** — farmer `/farmer` → *Withdraw 396.90 USDC*; holder `/portfolio` → *Claim refund 45.00 USDC*; `/exports` → *Download CSV*.

## Structure

```
app/<route>/page.tsx + _components/   route-only UI (server shell + client leaves)
components/{ui,lot,trust,money,evidence,wallet,layout,common,i18n}
providers/{near,query,locale}-provider.tsx, providers.tsx (single client boundary)
hooks/queries/use-*.ts · hooks/mutations/use-*-mutation.ts · hooks/use-session.ts
lib/{env,api,seo,roles,fixtures,profile,explorer,utils}.ts · lib/near/{contracts,format,errors,types}.ts · lib/i18n/{en,index,types}.ts
tokens.css (Hallmark) · .hallmark/log.json · .claude/skills (pinned in skills-lock.json)
```

Conventions and mandatory agent skills: [`AGENTS.md`](AGENTS.md). Wallet details: [`../docs/WALLETS.md`](../docs/WALLETS.md).

## Credits

Rice-planting photo by [Redicul Pict](https://unsplash.com/@rdcl) on [Unsplash](https://unsplash.com/photos/a-group-of-people-working-in-a-rice-field-73H3_OSyWOM) (from the `pratala-web3` prototype). Fonts: Newsreader, IBM Plex Sans, IBM Plex Mono (Google Fonts, OFL). Icons: Phosphor.
