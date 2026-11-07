# Pratala API — agent rules

> **MANDATORY.** Read the root [`AGENTS.md`](../AGENTS.md) and [`docs/INTERFACES.md`](../docs/INTERFACES.md) first. This folder ships installed agent skills in `.claude/skills/`, hash-pinned in `skills-lock.json`. Read and apply the matching `SKILL.md` before writing code in that domain. Do NOT skip. Do NOT improvise.

## Agent skills

| Domain | Skill | When to apply |
| --- | --- | --- |
| Modules, DI, guards, pipes, errors, tests | `nestjs-best-practices` | Any `*.module.ts`, `*.controller.ts`, `*.service.ts`, guard, filter, pipe or spec |
| Controllers, DTOs, Swagger, auth patterns | `nestjs-expert` | New routes, request validation, `@nestjs/swagger` decorators, JWT/cookie auth |
| Prisma setup, generator, driver adapter | `prisma-orm-setup` (Prisma 7 references) | `prisma.config.ts`, `schema.prisma` generator/datasource, `PrismaService` |
| Prisma CLI (migrate, generate, seed) | `prisma-cli` | Creating migrations, `migrate deploy` in Docker, `db seed` |
| Prisma queries | `prisma-client-api` | `findMany`/`upsert`/transactions/filters in services |
| Postgres | `prisma-postgres`, `prisma-database-setup` (deprecated alias) | Connection strings, Postgres-specific types |
| NEAR RPC, NEP-413 auth, tx status | `near-api-js` | `common/near/rpc.service.ts`, `auth/`, `indexer/`, `orders/` confirmation |
| NEAR Intents 1Click | `near-intents` | `intents/` (tokens, quote, deposit/submit, status) |
| NEAR AI Cloud (TEE inference, signatures) | `near-ai-cloud` | `ai/` (vision check, `/v1/signature/{chat_id}`, model tiers) |

### How to use skills

1. Before writing code, read the whole `SKILL.md` of every matching skill, then only the `rules/` or `references/` files that apply.
2. Do not edit files under `.claude/skills/` — the `skills` installer manages them and `skills-lock.json` pins their hashes.
3. Skills show `npm`/`npx`; here use `pnpm add` / `pnpm exec` / `pnpm dlx`.

## Project facts the skills depend on

- **NestJS 12, ESM only.** Relative imports end in `.js`; no `__dirname` (use `import.meta.dirname`). Tests run on **Vitest** (`vi.fn()`, not `jest.fn()`), lint is **oxlint** (`pnpm lint`). Nest 12 docs index: https://docs.nestjs.com/llms.txt.
- **Validation** uses Zod 4 schemas through Nest 12's global `StandardSchemaValidationPipe` (`@Body({ schema })`, `@Query({ schema })`, `@Param('x', { schema })`); Swagger bodies come from `ApiZodBody(schema)` in `src/common/zod.ts`. No class-validator DTOs.
- **Errors** leave as `{ statusCode, error, message?, issues? }` (`src/common/filters/http-exception.filter.ts`); use `apiError(status, 'snake_code')` for machine-readable codes.
- **E2E** (`pnpm test:e2e`) needs the compose Postgres (`docker compose up -d postgres && pnpm db:deploy`) and overrides `NearRpcService` with a fake; never hit real RPC/1Click/NEAR AI in tests.
- **Prisma 7.10.1 exactly** (npm `latest` is an 8.0 RC — do not upgrade). Generator `prisma-client` outputs to `src/generated/prisma` (git-ignored, run `pnpm prisma generate`); driver adapter `@prisma/adapter-pg`; connection URL lives in `prisma.config.ts`, not in `schema.prisma`.
- **near-api-js 7.4.0**: `JsonRpcProvider` for view calls / `viewTransactionStatusWithReceipts`; `verifyMessage` from `near-api-js/nep413`.
- **Chain may be absent.** Contracts may not be deployed: every chain call must degrade (empty arrays, `chain.lotsContract: "missing"`), never crash or crash-loop.
- **NEAR AI is optional.** Empty `NEAR_AI_API_KEY` ⇒ `POST /ai/check` returns `503 {error:"ai_unavailable"}`; no other flow depends on it.
- **1Click is mainnet only.** Quotes default to `dry: true`.

## Rules

- Feature folders under `src/<feature>/` (`*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.schemas.ts`, `*.spec.ts`). No barrels. 500-line cap per file.
- HTTP shapes are defined by `docs/INTERFACES.md` §5. Changing one means editing that file in the same commit.
- Never send blockchain transactions or deploy from this service. It only reads chain state.
- Never commit `.env`, `data/` (uploads) or `dist/`.
- Verify: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; `docker compose up -d --build` from the repo root then `curl -s localhost:4100/api/health`.
