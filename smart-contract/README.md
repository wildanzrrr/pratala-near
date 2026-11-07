# Pratala smart contracts

Rust contracts for Pratala on NEAR (near-sdk 5.30.1, Rust 1.95.0). Rules for contributors and agents: [`AGENTS.md`](AGENTS.md).

| Contract | Crate | Standards | What it does |
| --- | --- | --- | --- |
| `harvest-lot` | [`contracts/harvest-lot`](contracts/harvest-lot) | NEP-171/177/178/181, NEP-297, NEP-141 receiver | One NFT per harvest lot. Field → coop → warehouse attestations drive the lifecycle; the NFT holds pUSDC escrow and settles it to the farmer, the treasury and the current NFT holder. |
| `pusdc` | [`contracts/pusdc`](contracts/pusdc) | NEP-141, NEP-145, NEP-148 | Test stablecoin (6 decimals) with a capped public faucet and owner mint. |

## Commands

Run from `smart-contract/`.

| Do | See |
| --- | --- |
| `make build` | `target/near/pusdc/pusdc.wasm` and `target/near/harvest_lot/harvest_lot.wasm` |
| `make unit` | unit tests pass (`cargo test --workspace --lib`) |
| `make test` | unit + sandbox integration tests pass (first run downloads the sandbox binary and builds both wasm) |
| `make fmt-check clippy` | no diff, no warnings |
| `make check` | all of the above |

## Docs

- [`../docs/INTERFACES.md`](../docs/INTERFACES.md) — shared ABI used by backend, frontend and scripts.
- [`../docs/CONTRACTS.md`](../docs/CONTRACTS.md) — every method, access rule, deposit, event, storage model and the settlement math.
- [`../docs/NFT-CONTROL.md`](../docs/NFT-CONTROL.md) — how money and control pass with the NFT, threat model, and the tests that prove it.
