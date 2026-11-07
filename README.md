# Pratala — verified harvest lots on NEAR

> Work in progress for the NEAR HACKATHON (Nov 1–14, 2026). Tracks: Real-World Money · NFTs That Do Something · Open Innovation.

Pratala lets an Indonesian farmer turn a verified harvest projection into a NEAR NFT that holds stablecoin escrow. A buyer funds it from NEAR (pUSDC on testnet) or, in production, from any chain through NEAR Intents. Three independent attestations — field agent, cooperative, warehouse weigh-in — act as the oracle; the weigh-in settles the escrow to the farmer and refunds any under-delivery to whoever holds the NFT at that moment.

## Repository

| Folder | What |
| --- | --- |
| [`smart-contract/`](smart-contract/) | Rust contracts: `harvest-lot` (NEP-171 + escrow) and `pusdc` (NEP-141 test stablecoin) |
| [`backend/`](backend/) | NestJS API: NEP-413 login, evidence uploads, AI evidence check (NEAR AI Cloud), indexer, payments CSV, NEAR Intents proxy |
| [`frontend/`](frontend/) | Next.js app: farmer, verifier, buyer and admin flows, wallet via NEAR Connect |
| [`docs/`](docs/) | Architecture, contracts, payments guide, AI verification, wallets, disclosure |
| [`scripts/`](scripts/) | Toolchain, accounts, deploy, seed, verify |

The full build plan is in [`docs/PLAN.md`](docs/PLAN.md). The judge-facing "Try it in 5 minutes" section, contract ids and demo accounts are added as each milestone lands.

## License

MIT — see [`LICENSE`](LICENSE).
