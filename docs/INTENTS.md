# NEAR Intents (1Click) cross-chain checkout

Pratala's checkout has a second tab, "pay from another chain". It is backed by NEAR Intents' **1Click API** (`https://1click.chaindefuser.com/v0`) through four proxy routes in the API (`backend/src/intents/`), ported from the October 2026 prototype `pratala-web3/server.mjs`.

## Mainnet only, so the demo shows dry quotes

1Click has **no testnet**. The lots contract and pUSDC run on testnet, so a real cross-chain payment into a testnet lot is not possible. The demo therefore:

- lists live mainnet tokens (`GET /api/intents/tokens`, cached 60 s);
- requests **dry quotes** (`POST /api/intents/quote` with `dry` defaulting to `true`): 1Click returns a price and expected output but **no deposit address**, so no funds can be sent by mistake;
- returns `network` and `dry` on every quote so the web app can label the tab as a mainnet preview in which no funds move.

Every quote response contains `"network": "mainnet"` and `"dry": true|false`.

## Routes

| Route | What it does |
| --- | --- |
| `GET /api/intents/tokens` | `{ tokens, fetchedAt }` from 1Click `/tokens` |
| `POST /api/intents/quote` | Validates the body (same rules and messages as the prototype), converts `amount` to base units with BigInt (`decimalToBaseUnits`), sends an `EXACT_INPUT` quote, stores it in `IntentsQuote` and returns `{ quote, request, network, dry, partnerKeyConfigured, feeNotice }` |
| `POST /api/intents/deposit/submit` | Passes `{ depositAddress, txHash }` to 1Click to speed up a real swap |
| `GET /api/intents/status?depositAddress=` | Passes through the swap status (`PENDING_DEPOSIT`, `KNOWN_DEPOSIT_TX`, `PROCESSING`, `SUCCESS`, `INCOMPLETE_DEPOSIT`, `REFUNDED`, `FAILED`) |

Quote body: `originAsset`, `destinationAsset` (asset ids from the token list), `amount` (decimal string in origin-token units), `recipient`, `refundTo`, optional `slippageTolerance` (integer bps, 1–5000, default 100) and `dry` (boolean, default `true`). Validation runs before any network call. The intents routes are throttled to 20 requests per minute per client.

Changes from the prototype: `dry` defaults to `true` (it was hard-coded `false`); the partner key is sent on **all** calls, not only `/quote`; requests are throttled; quotes are stored.

## Fees and the API key

Without partner authentication 1Click adds a **0.25% (25 bps)** platform fee to every non-`ANY_INPUT` quote. Set `NEAR_INTENTS_API_KEY` in `backend/.env` to use the authenticated fee schedule; the key is sent as both `Authorization: Bearer` and `X-API-Key`. The quote response says which applies (`partnerKeyConfigured`, `feeNotice`) so the web app can show it next to the quote.

## Production path

To accept real cross-chain payments for lots:

1. Deploy the lots contract and use a real stablecoin (for example native USDC on NEAR mainnet) instead of pUSDC.
2. Quote with `dry: false` and `recipient` = the buyer's NEAR account, `recipientType: DESTINATION_CHAIN`, destination asset = the stablecoin, so the swapped stablecoin lands in the buyer's account. The buyer then funds the lot with the usual `ft_transfer_call`. (1Click's `customRecipientMsg` could make the swap call `ft_transfer_call` on the lots contract directly, but a wrong message loses funds, so the two-step flow is safer.)
3. Show the deposit address and deadline, let the buyer deposit on the origin chain, call `deposit/submit`, and poll `status` until it is final.
4. Configure `NEAR_INTENTS_API_KEY` to avoid the unauthenticated fee.
