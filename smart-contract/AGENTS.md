# Pratala Smart-Contract Conventions

> **MANDATORY.** Every agent and contributor working in `smart-contract/` MUST follow these rules. They override the root `AGENTS.md` inside this folder. Read this file before changing code, dependencies, contract interfaces, tests, or contract documentation.
>
> **Status first:** read the root [`CHANGELOG.md`](../CHANGELOG.md) ("Current status" + open items) before starting, and add an `[Unreleased]` entry in the same commit as any behaviour, interface or deployment change (root `AGENTS.md` §7).

## 1. Installed Skills — Required Usage

The skills in `.claude/skills/` (pinned in `skills-lock.json`, source `near/agent-skills`) are the source of truth for their domains. Before doing work covered by a skill, read its `SKILL.md` and the rule/reference files it routes to.

| Domain | Skill | Apply when | Mandatory? |
| --- | --- | --- | --- |
| NEAR contract code, state, cross-contract calls, tests | `near-smart-contracts` | Any Rust change under `contracts/`, any ABI change, any new test | Yes |
| Security review | `near-contract-audit` | Before committing value-moving, permissioned, or callback logic; before tagging a release | Yes |
| CLI commands (view, call, deploy) | `near-cli-rs` | Writing docs or scripts that show `near` commands | Yes |

Required reading by task:

- Storage / deposits: `near-smart-contracts/rules/security-storage-checks.md`, `state-collections.md`.
- Promises and callbacks: `near-smart-contracts/rules/xcc-promise-chaining.md` + the upstream "Do not panic in callbacks" and "Secure `ft_on_transfer`" pages linked from the skill.
- Integration tests: `near-smart-contracts/rules/testing-integration-tests.md`.
- Audit: `near-contract-audit/references/{high,medium,low}-severity.md`.

> Ignoring a relevant skill is a defect. Verify crate versions on crates.io / docs.rs, not from memory.

## 2. Project Structure

```text
smart-contract/
├── Cargo.toml              # workspace: members, shared dependency versions, release profile
├── rust-toolchain.toml     # pinned toolchain (1.95.0 + wasm32-unknown-unknown)
├── Makefile                # build / test / fmt / clippy / check
├── contracts/
│   ├── harvest-lot/
│   │   ├── src/
│   │   │   ├── lib.rs        # contract state, #[init], module wiring
│   │   │   ├── nft.rs        # NEP-171/177/178/181 trait impls (transfer guard)
│   │   │   ├── types.rs      # ABI-visible types (Lot, LotView, Status, ...)
│   │   │   ├── storage.rs    # StorageKey enum + lot load/save helpers
│   │   │   ├── errors.rs     # error message constants
│   │   │   ├── events.rs     # NEP-297 "pratala" events
│   │   │   ├── roles.rs      # owner/admin + role allowlists
│   │   │   ├── lifecycle.rs  # register, attest, list, cancel, weigh-in, failure
│   │   │   ├── escrow.rs     # ft_on_transfer funding, settlement math, claims, callback
│   │   │   ├── validate.rs   # input validation helpers
│   │   │   ├── views.rs      # view methods
│   │   │   └── test.rs       # unit tests (VMContextBuilder)
│   │   └── tests/            # sandbox integration tests (near-sandbox + near-api)
│   └── pusdc/                # NEP-141 test stablecoin (src/lib.rs, src/test.rs)
└── AGENTS.md
```

Placement rules:

| Concern | Location |
| --- | --- |
| New deployable contract | `contracts/<kebab-case-name>/`, `crate-type = ["cdylib", "rlib"]`, `[lints] workspace = true` |
| Dependency versions | Root `[workspace.dependencies]` only; children use `x.workspace = true` |
| ABI-visible struct/enum | `src/types.rs` with `#[near(serializers = [json, borsh])]` |
| Collection prefixes | `src/storage.rs` `StorageKey` variants (append only) |
| Expected failure messages | `src/errors.rs` constants, prefixed `harvest-lot:` |
| Observable state change | `src/events.rs` variant |
| Unit tests | `src/test.rs` |
| Integration tests | `tests/<scenario>.rs` + shared harness in `tests/common/mod.rs` |
| Contract docs | `../docs/CONTRACTS.md`, `../docs/NFT-CONTROL.md` |

- Keep production source files below **500 lines**. Split by concern before exceeding the limit.
- `lib.rs` is orchestration only; logic lives in the concern modules.
- Comments explain *why* (invariants, security reasoning), not *what* the next line does.

## 3. Contract Implementation Rules

### Public ABI

- `../docs/INTERFACES.md` is the shared ABI with backend, frontend and scripts. Any change to a method name, argument, JSON shape, event or deposit MUST update `INTERFACES.md` in the same commit with the reason in the commit body.
- JSON amounts are `U128` strings; counts and `*_ms` timestamps are `u64` numbers. Never expose a raw `u128` in JSON.
- Append new `StorageKey` variants and new fields only with a migration plan; never reorder or remove existing variants once deployed.

### Access, deposits, value movement

- Authorise with `env::predecessor_account_id()` against stored owner / role sets. Never trust an account id passed in arguments.
- Verifier and farmer lifecycle methods are **non-payable** so function-call access keys can call them; the contract pays their bounded storage out of the reserve collected at `register_lot`.
- `register_lot` charges measured storage plus the attestation reserve and refunds the excess.
- Mutate state **before** any cross-contract call (claim zeroed + `claim_lock` set before `ft_transfer`). Callbacks are `#[private]`, use `#[callback_result]`, never panic, and always clear the lock.
- `ft_on_transfer` checks `predecessor == usdc_contract` first; any invalid input panics so the FT contract refunds the full amount.
- Use checked arithmetic for every amount; `overflow-checks = true` stays on in the release profile.
- Bound everything: strings ≤ 256 bytes, ≤ 8 attestations per lot, paginated views (limit ≤ 100).

## 4. Testing and Verification

- Every public state-changing method needs a positive test, an access-control test, and an error-path test.
- Value-moving flows (funding, settlement, claims) need balance assertions in sandbox integration tests.
- Callback failure paths are tested with mocked `PromiseResult::Failed` in unit tests and with a real failing `ft_transfer` in sandbox.

Before handoff, run from `smart-contract/`:

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
make build        # cargo near build non-reproducible-wasm for each contract
```

## 5. Operational Safety

- **Never deploy, create accounts, or send testnet/mainnet transactions unless the user explicitly asks.** Building wasm and running sandbox tests is always fine.
- Never put private keys, seed phrases or credentials in source, tests, docs or shell output.
- The contracts have no upgrade entry point. Redeploying requires the account's full-access key; adding an upgrade path needs an explicit migration and authorization plan first.
