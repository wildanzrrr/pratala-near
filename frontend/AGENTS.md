# Pratala web — agent rules

> **MANDATORY.** Read the root [`AGENTS.md`](../AGENTS.md) and [`docs/INTERFACES.md`](../docs/INTERFACES.md) first. Every agent working in `frontend/` MUST follow these rules. No exceptions. A violated rule is a bug and a reviewer will flag it.

## 1. Skills — forced usage

This folder ships installed agent skills in `.claude/skills/`, hash-pinned in `skills-lock.json`. You **MUST** read the matching `SKILL.md` before writing code in that domain, then only the `rules/` or `references/` files that apply.

| Domain | Skill | When to apply | Mandatory |
| --- | --- | --- | --- |
| React / Next.js performance | `vercel-react-best-practices` | Any component, page, layout, route handler, bundle concern | YES |
| Component architecture | `vercel-composition-patterns` | Reusable components, compound components, context providers, boolean-prop overload | YES |
| UI primitives (shadcn/ui) | `shadcn` | Adding, composing, styling or debugging anything in `components/ui/` | YES |
| Styling (Tailwind v4) | `tailwind-design-system` | Tokens, `app/globals.css`, `tokens.css`, responsive patterns, variants | YES |
| Server state (TanStack Query) | `tanstack-query-best-practices` | `useQuery` / `useMutation`, key factories, invalidation, optimistic UI | YES |
| SEO / AEO | `seo-aeo-best-practices` | `metadata` / `generateMetadata`, OG images, `robots.ts`, `sitemap.ts`, JSON-LD | YES |
| Landing / marketing design | `design-taste-frontend` (+ user-level `hallmark`) | `/` and any marketing surface; anti-template checks | YES |
| App screen polish & UX | `impeccable` | Every other screen: critique, audit, states, motion, hardening | YES |
| Wallet connection, dApp wiring | `near-dapp` | `providers/near-provider.tsx`, `components/wallet/*` | YES |
| RPC, transactions, NEP-413, units | `near-api-js` | `lib/near/*`, sign-in mutation, tx status | YES |
| Cross-chain checkout (1Click) | `near-intents` | `/checkout` tab B, `hooks/queries/use-intents-*` | YES |

Where skills disagree: `design-taste-frontend` leads on the landing, `impeccable` on app screens, `docs/INTERFACES.md` beats every skill on contract/API shapes. Do not edit files under `.claude/skills/`. Skills show `npm`/`npx`; here use `pnpm add` / `pnpm dlx`.

> `near-connect-hooks` (community skill `nearbuilders/near-skills`) is not installable (repo private / gone). Its API is mirrored by our own `providers/near-provider.tsx` — see §9.

## 2. File & folder structure

```
app/
  layout.tsx            root layout: fonts, <Providers>, AppShell, JSON-LD
  page.tsx              landing (server)
  [route]/
    page.tsx            server component, exports metadata
    _components/        components used ONLY by this route
    _hooks/             hooks used ONLY by this route (optional)
components/
  ui/                   shadcn primitives (generated; edit through variants)
  <feature>/            shared feature components (lot, trust, money, wallet, layout, evidence, common)
providers/              client providers (near, query, locale) + providers.tsx (single client boundary)
hooks/
  queries/use-*.ts      one hook per query, each with a `*Keys` factory
  mutations/use-*-mutation.ts
lib/                    env, near/contracts, near/format, api, i18n, roles, seo, explorer, fixtures, utils
tokens.css              Hallmark-generated `--pt-*` tokens (source of truth)
```

| Component scope | Location |
| --- | --- |
| Used by 2+ routes | `components/<feature>/` |
| Used by 1 route | `app/<route>/_components/` |
| shadcn primitive | `components/ui/` |

Never import another route's `_components/`; promote to `components/` instead. Files are kebab-case, components PascalCase, hooks `use-*`. No barrel files.

## 3. File size — 800 lines

Max **800 lines** per `.ts`/`.tsx`. A file at 801 lines is a bug. Split into sub-components or modules and re-check.

## 4. Data — TanStack Query, hook-per-query

- **Chain first.** Read chain state through `lib/near/contracts.ts` (JSON-RPC view calls). Use the backend API (`lib/api.ts`) only for off-chain data (evidence, AI checks, history, payments, notifications, profiles). Every page must render with the API down.
- Every call gets its own hook in `hooks/queries/` with a hierarchical key factory (`lotKeys.detail(id)`). Components import hooks, never `useQuery` inline.
- Mutations live in `hooks/mutations/`. After a successful transaction: `POST /api/tx` (ignore failure), invalidate the exact keys touched, toast a plain-language status with a "View proof" explorer link (`lib/tx-feedback.ts`).
- Contract-not-deployed and API-offline are **states**, not crashes: `ContractNotDeployedError` → `<NotDeployedState/>`, `ApiUnavailableError` → `<ApiOfflineBanner/>`.
- `NEXT_PUBLIC_DEMO_FIXTURES=1` renders sample lots from `lib/fixtures.ts`, always labelled "Sample". Fixtures and live data are never mixed in one view.

## 5. Server vs client

- Default is a Server Component. `"use client"` only for state, effects, events, browser APIs, wallet.
- `cacheComponents` is on (Next 16.4): runtime APIs (`params`, `searchParams`, `cookies`) and uncached fetches go inside `<Suspense>`; cache with `"use cache"` + `cacheLife()`.
- Client providers are mounted once from `app/layout.tsx` through `providers/providers.tsx`.

## 6. Styling — Tailwind v4 + shadcn

- Semantic tokens only (`bg-primary`, `text-muted-foreground`, `border-border`). Raw hex/oklch only in `tokens.css` and `app/globals.css`.
- shadcn vars in `globals.css` are mapped to `--pt-*` tokens; change the token, not the component.
- `className` is for layout; colour/typography changes go through variants. `cn()` for conditionals. No `space-x-*`/`space-y-*` — use `flex`/`grid` + `gap-*`.
- Headings use the serif display face, **roman only** — no italic headings.
- Phosphor icons only, one weight (`regular`; `bold` for 16 px status glyphs). Server files import from `@phosphor-icons/react/dist/ssr`.
- Mobile first. Verify 320 / 375 / 414 / 768 px. Touch targets ≥ 44 px. Every interactive control has 8 states (default, hover, focus-visible, active, disabled, loading, error, success). Respect `prefers-reduced-motion`.

## 7. Copy & language

- The UI is **English only** — no second dictionary, no language toggle. All UI strings (including `alt`, `aria-label`, toasts and zod messages) live in `lib/i18n/en.ts`, which is the source of truth for the `Dictionary` type; read them with `useT()` / `<T k=…/>` in components and `serverT()` on the server. No hard-coded copy in components. Route `metadata` and JSON-LD text may sit in the route file, in English. No non-English copy anywhere, comments included (place names such as Karawang and the brand Pratala excepted).
- Farmer and verifier screens never show "seed phrase", "gas", "yocto", "wallet" jargon, raw hashes as primary content, or token decimals. Say "Account", "Sign", "View proof".
- Money: pUSDC with 6 decimals as BigInt (`lib/near/format.ts`), with "≈ Rp" at the **demo rate** (`NEXT_PUBLIC_DEMO_IDR_RATE`), always labelled as a demo rate.
- No invented metrics, testimonials or partner logos. Stats come from `get_stats` or render "—".

## 8. SEO

- Every page exports `metadata` via `createMetadata()` from `@/lib/seo` (or `generateMetadata`). Utility/auth surfaces pass `noIndex: true`.
- `/lot/[id]` renders Product/Offer JSON-LD and has an OG image route.
- `app/robots.ts` and `app/sitemap.ts` are the single source for crawl rules.

## 9. NEAR

- **Wallet:** `providers/near-provider.tsx` builds one `NearConnector` (`@hot-labs/near-connect` 0.12, network from env) and exposes `useNear()` with the same surface as `near-connect-hooks`' `useNearWallet` (`signedAccountId`, `loading`, `connect(walletId?)`, `signOut`, `signAndSendTransaction(s)`, `signMessage`, `wallets`). The connect UI is our own `components/wallet/connect-sheet.tsx`: HOT Wallet (MPC) and Meteor recommended first, the rest of the NEAR Connect manifest below.
- **Function-call keys:** `function-call-key-plugin` 2.2 is registered with `contractId = NEXT_PUBLIC_LOTS_CONTRACT_ID`, the FC-friendly methods from INTERFACES §3 (`FC_METHODS` in `lib/near/contracts.ts`) and a 0.25 NEAR allowance. Zero-deposit calls to those methods sign locally — no popup. Anything with a deposit (`register_lot` 0.1 NEAR, `ft_transfer_call` 1 yocto, `nft_transfer` 1 yocto, faucet `storage_deposit`) goes to the wallet. Never move a payable method into `FC_METHODS`.
- **Contracts lib:** all method names, args, deposits and gas live in `lib/near/contracts.ts`, typed against INTERFACES §3–4. Never call `callFunction` with a literal method name from a component.
- **Backend session:** NEP-413 challenge → `wallet.signMessage` → `/auth/verify`. Chain features never require it.
- Never send transactions from scripts, never deploy, never hard-code account ids outside `lib/env.ts`.

## 10. Verification before handoff

```bash
pnpm lint && pnpm typecheck && pnpm build
```

Then `pnpm dev` and check the routes return 200 at 320/375/414/768 px.

## 11. Docs

| Document | Topic |
| --- | --- |
| [`../docs/INTERFACES.md`](../docs/INTERFACES.md) | Contract ABI + backend API (source of truth) |
| [`../docs/DESIGN.md`](../docs/DESIGN.md) | Hallmark theme, tokens, screen map |
| [`../docs/WALLETS.md`](../docs/WALLETS.md) | NEAR Connect, HOT/Meteor, FC keys, NEP-413 |
| [`README.md`](README.md) | Run, env, routes |

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
