# scripts/

Bash scripts that take a clean machine to a seeded Pratala demo on NEAR testnet and then check it. Run them from the repo root, in order. Each one prints what it will do (`→ expect: …`) and what to run next.

| # | Script | Changes testnet? | Do → see |
| --- | --- | --- | --- |
| 00 | `00-install-toolchain.sh` | no | `CHECK_ONLY=1 scripts/00-install-toolchain.sh` → a ✓ row per tool and `CHECK_ONLY: toolchain complete`. Without `CHECK_ONLY` it offers to install the missing Rust tools. |
| 01 | `01-install-skills.sh` | no | `scripts/01-install-skills.sh` → `<folder>: restored from skills-lock.json` for `smart-contract`, `backend`, `frontend`. `DRY_RUN=1` lists them and installs nothing. |
| 02 | `02-create-accounts.sh` | **yes** | `scripts/02-create-accounts.sh` → `✓ accounts ready` and a table of 9 accounts with explorer links. `deploy/testnet.json` `.accounts` is filled. |
| 03 | `03-deploy-contracts.sh` | **yes** | `scripts/03-deploy-contracts.sh` → `✓ pusdc deployed`, `✓ lots deployed`, the `get_config` JSON, then env lines for `backend/.env` and `frontend/.env.local`. |
| 04 | `04-seed-demo.sh` | **yes** | `scripts/04-seed-demo.sh` → `✓ seed complete: lot-1 Settled, lot-2 Listed, lot-3 FieldVerified` followed by every seed tx link. |
| 05 | `05-verify-demo.sh` | no (read-only) | `scripts/05-verify-demo.sh` → ✓ for each check and `all checks passed`, exit 0. Exit 1 means a mismatch or unreachable contract. Exit 2 means nothing is deployed yet. |

Scripts 02, 03 and 04 ask `Proceed? [y/N]` before they send anything. Set `YES=1` to skip the prompt, for example in a non-interactive shell. They refuse to run unless `NEAR_NETWORK=testnet`.

## What 04 seeds (numbers from `docs/INTERFACES.md`)

- Roles: `agent1` FieldAgent, `coop1` Coop, `warehouse1` Warehouse.
- pUSDC `storage_deposit` for all six actors, root and the lots contract. `buyer1` takes 1,000 pUSDC from the faucet.
- **lot-1** goes through the whole lifecycle: rice IR64, Karawang, 1,000 kg, harvest two months ahead. Steps: field visit, co-op review, listed at 0.45 pUSDC/kg, `buyer1` funds 450 pUSDC with `ft_transfer_call`, weigh-in at 900 kg grade A. Payouts: farmer claims 396.90, treasury claims 8.10. Then `buyer1` transfers the NFT to `investor2`, who claims the 45.00 refund.
- **lot-2** is left at Listed: rice Ciherang, Subang, 800 kg, 360 pUSDC. A judge with faucet pUSDC can fund it.
- **lot-3** is left at FieldVerified: corn Bisi 18, South Lampung, 1,500 kg. The co-op attests it live in the demo.
- Evidence and plot hashes are `sha256("pratala-demo/<lot-key>/<fixture>")`, so they are the same on every run.

Each step reads chain state first, so re-running 02, 03 or 04 picks up where the last run stopped. After every transaction the script re-reads the lot and stops if the expected status did not appear. This matters because a failed `ft_on_transfer` or payout still lands as a successful transaction with a refund.

## Outputs

- `deploy/testnet.json` holds account ids, contract wasm hash and size, init args, lot ids and every tx hash under `.txs`. It contains no keys. Commit it after a real deploy so judges and `05` can find the contracts. The schema is in `deploy/testnet.json.example`.
- `deploy/logs/` holds the raw near-cli output of every call. It is git-ignored by `deploy/.gitignore`.
- Keys live in `config/keys/<account>.json` (gitignored via `config/*`, chmod 600) in near-cli-rs credential format. 02 saves each new account's key there; for accounts that already exist it migrates the key from the macOS Keychain on first re-run. Nothing secret is tracked by git.

## Environment overrides

| Variable | Default | Used by |
| --- | --- | --- |
| `YES` | `0` | 00, 01, 02, 03, 04: skip `Proceed? [y/N]` |
| `CHECK_ONLY` | `0` | 00: report only |
| `DRY_RUN`, `FOLDERS` | `0`, `smart-contract backend frontend` | 01 |
| `ROOT_ID` | `pratala.testnet` | 02: root/owner/treasury. Falls back to `<base>-hack.testnet`, then `<base>-<4hex>.testnet` if taken |
| `ROOT_EXISTING` | `0` | 02: adopt an existing `ROOT_ID` whose key you hold (`config/keys/<id>.json`, or the macOS Keychain to migrate from) |
| `ACTOR_SUFFIX` | random 4 hex, then kept in testnet.json | 02: `pratala-<actor>-<suffix>.testnet` |
| `LOTS_FUND_NEAR`, `PUSDC_FUND_NEAR` | `6`, `3` (or wasm size ÷ 100 KB + headroom, if larger) | 02 |
| `ROOT_RESERVE_NEAR`, `ACTOR_KEEP_NEAR`, `FAUCET_DELAY` | `2`, `3`, `3` s | 02 |
| `SKIP_BUILD`, `REDEPLOY` | `0`, `0` | 03: reuse the wasm; upgrade code on initialised contracts without an init call |
| `FEE_BPS`, `TOTAL_SUPPLY`, `LOTS_INIT_ARGS` | `200`, `1000000000000`, from INTERFACES §3 | 03 |
| `LOTS_STORAGE_POOL_NEAR` | `2` | 03: free NEAR kept on the lots account for attestation storage |
| `LOTS_WASM`, `PUSDC_WASM` | `smart-contract/target/near/{harvest_lot,pusdc}/*.wasm` | 02, 03 |
| `NEAR_NETWORK` | `testnet` | all |
| `NEAR_RPC_URL`, `NEAR_ARCHIVAL_RPC_URL` | `https://test.rpc.fastnear.com`, `https://archival-rpc.testnet.fastnear.com` | balance and tx lookups (05 reads old claim txs from archival) |
| `EXPLORER_BASE` | `https://testnet.nearblocks.io` | links |
| `KEYS_DIR` | `config/keys` | all signed calls: one `<account>.json` credential file per account (`account_id`, `public_key`, `private_key`) |
| `DEPLOY_FILE`, `LOG_DIR`, `ENV_FILE` | `deploy/testnet.json`, `deploy/logs`, `.env` | all |

`.env` at the repo root is optional and only fills in variables that are not already set. Contract ids always come from `deploy/testnet.json` once it exists.

## Requirements

near-cli-rs 0.31.x (`near`), cargo-near 0.23.0, Rust 1.95.0 with `wasm32-unknown-unknown`, `jq`, `curl`, `awk`. `00-install-toolchain.sh` checks all of them. The near-cli-rs commands used:

```sh
near account view-account-summary <id> network-config testnet now
near account create-account sponsor-by-faucet-service <id> autogenerate-new-keypair --signature-scheme ed25519 save-to-legacy-keychain network-config testnet create
near account create-account fund-myself <sub.id> '<n> NEAR' autogenerate-new-keypair --signature-scheme ed25519 save-to-legacy-keychain sign-as <root> network-config testnet sign-with-plaintext-private-key '<root key from config/keys>' send
near tokens <from> send-near <to> '<n> NEAR' network-config testnet sign-with-plaintext-private-key '<key from config/keys>' send
near contract deploy <id> use-file <wasm> with-init-call new json-args '<json>' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-plaintext-private-key '<key from config/keys>' send
near contract deploy <id> use-file <wasm> without-init-call network-config testnet sign-with-plaintext-private-key '<key from config/keys>' send
near contract call-function as-transaction <contract> <method> json-args '<json>' prepaid-gas '<g> Tgas' attached-deposit '<d>' sign-as <signer> network-config testnet sign-with-plaintext-private-key '<signer key from config/keys>' send
near --quiet contract call-function as-read-only <contract> <method> json-args '<json>' network-config testnet now
```

New-account keys are generated to `~/.near-credentials` by `save-to-legacy-keychain` and immediately moved into `config/keys/<account>.json` (`key_adopt_generated` in `lib.sh`); every signed call reads its key from there (`sign_with`). A missing key file is a hard error — there is no fallback key source.
