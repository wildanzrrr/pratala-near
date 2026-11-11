# Pratala — Monorepo Conventions

> **MANDATORY.** Every agent and contributor MUST read this file before changing anything. Folder-level rules live in `smart-contract/AGENTS.md`, `backend/AGENTS.md`, `frontend/AGENTS.md` and override this file inside their folder.

## 1. What this repo is

Pratala is an Indonesian agriculture marketplace where a verified harvest projection becomes a NEAR NFT (NEP-171) that holds stablecoin escrow (NEP-141). Field agent → cooperative → warehouse weigh-in attestations act as the oracle; settlement pays the farmer and refunds the current NFT holder. Built for the **NEAR HACKATHON** (submission deadline **2026-11-14 23:59 UTC**), tracks: Real-World Money, NFTs That Do Something, Open Innovation (Privacy & Private AI if the TEE AI check ships).

**Start every session here, in this order:**

1. [`CHANGELOG.md`](CHANGELOG.md) — the "Current status" block says what works, what is deployed on testnet, and the open items. Trust it over your memory of earlier sessions; verify anything you rely on.
2. This file, then the `AGENTS.md` of the folder you will touch.
3. [`docs/INTERFACES.md`](docs/INTERFACES.md) — contract ABI and API shapes shared by every folder.
4. [`docs/PLAN.md`](docs/PLAN.md) — the full plan, for context on why things are the way they are.

## 2. Layout

| Folder | Stack | Owner rules |
| --- | --- | --- |
| `smart-contract/` | Rust, near-sdk 5.30.1, Cargo workspace `contracts/*` | `smart-contract/AGENTS.md` |
| `backend/` | NestJS 12, Prisma 7.10.1, Postgres 16 (external), Docker (API only) | `backend/AGENTS.md` |
| `frontend/` | Next.js 16 App Router, Tailwind v4, shadcn, NEAR Connect | `frontend/AGENTS.md` |
| `docs/` | One Markdown file per topic | this file |
| `scripts/` | Bash: toolchain, accounts, deploy, seed, verify | this file |
| `deploy/testnet.json` | Deployed contract ids, demo accounts, tx hashes (generated) | scripts only |

## 3. Hackathon rules that shape the code

- The README is written for an **AI judge** (Claude Code / Codex run it): every setup step is "do X → see Y" with expected output. No marketing copy.
- **List every library, template, boilerplate and AI-generated file** in `docs/DISCLOSURE.md`. The pre-existing prototype (`pratala-web3`, Oct 2026) is disclosed there with what was ported.
- **Never commit secrets.** `.env*` is ignored; keys live in `.env` only.
- Testnet first. Deploying or changing network state requires the user's explicit OK.
- NEAR Intents 1Click has **no testnet** — cross-chain checkout uses mainnet `dry: true` quotes and says so in the UI.

## 4. Git — every update is a commit

- One commit per completed unit of work (a contract module, a test file, a Nest module, a route, a doc). Never batch a day into one commit; never leave the tree dirty at the end of a work block.
- Conventional Commits with scope: `feat(contract): …`, `test(contract): …`, `feat(api): …`, `feat(web): …`, `docs: …`, `chore: …`, `ci: …`.
- Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Agents working in parallel commit **only their own folder** (`git add smart-contract` etc.) and use `git commit -- <paths>` semantics. If `.git/index.lock` exists, wait 2 s and retry; never delete another process's lock.
- Milestone tags: `v0.1.0-contracts`, `v0.1.0-app`, `v0.1.0` (demo video), `hackathon-submission`.
- A change that alters behaviour, an interface, deployed state or project status also updates `CHANGELOG.md` **in the same commit** (§7).

## 5. Skills

Each folder installs agent skills into `<folder>/.claude/skills/` (pinned in `<folder>/skills-lock.json`; restore with `scripts/01-install-skills.sh`) and maps them to domains in its `AGENTS.md`. Read the relevant `SKILL.md` before writing code in that domain. Shared NEAR skills come from `near/agent-skills`.

## 6. Verification before handoff

- `smart-contract`: `cargo fmt --all -- --check && cargo clippy && cargo test` from `smart-contract/`.
- `backend`: `pnpm lint && pnpm typecheck && pnpm test` from `backend/`; `docker compose up -d --build` boots `api` against the external Postgres (`DATABASE_URL` in `backend/.env`).
- `frontend`: `pnpm lint && pnpm typecheck && pnpm build` from `frontend/`; mobile widths 320/375/414/768 checked.
- Root: `scripts/05-verify-demo.sh` reproduces the README numbers against testnet.

## 7. Changelog — the hand-off log

[`CHANGELOG.md`](CHANGELOG.md) is how agents and sessions hand work to each other. Format: Keep a Changelog.

- **Read it first** (§1). Before ending a session or handing back to an orchestrator, make sure it reflects what you did.
- **What gets an entry** under `## [Unreleased]` (`Added` / `Changed` / `Fixed` / `Removed` / `Security`): new features, behaviour changes, interface changes (`docs/INTERFACES.md`), migrations, deployments and other chain-state changes, bug fixes a user would notice, and decisions made by the user. Skip pure refactors, formatting and typo fixes.
- **Entry style**: one line per change, what changed and why it matters, followed by the commit hash(es) in backticks once known. English only.
- **Current status block**: keep the table, the verified local-run line and the numbered **Open items** accurate. When you close an open item, remove it and record the fix under `[Unreleased]`. When you discover a new blocker or a decision the user must make, add it. Update the timestamp in the heading.
- **Testnet state**: any deploy, reseed, role grant or other transaction changes the "Testnet deploy" and "Demo lots" rows and `deploy/testnet.json` in the same commit.
- **Releases**: when tagging (`v0.1.0-app`, `v0.1.0`, `hackathon-submission`), rename `[Unreleased]` to `[<tag>] — <date>` and start a new empty `[Unreleased]`.
- **Parallel agents**: edit only the lines for your own area to avoid conflicts; if `CHANGELOG.md` changed under you, re-read it and merge, never overwrite another agent's entries.

