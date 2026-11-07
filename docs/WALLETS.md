# Wallets, signing and identity

How people sign in to Pratala, which actions pop a wallet window and which don't, and what is on the roadmap. Code: [`frontend/providers/near-provider.tsx`](../frontend/providers/near-provider.tsx), [`frontend/components/wallet/`](../frontend/components/wallet), [`frontend/lib/near/contracts.ts`](../frontend/lib/near/contracts.ts).

## 1. NEAR Connect

Every user connects a NEAR account through **[`@hot-labs/near-connect`](https://github.com/hot-dao/near-selector) 0.12**. It loads a wallet manifest (HOT Wallet, Meteor, Intear, Nightly, MyNearWallet, Ledger, NEAR Mobile, OKX, …) and runs each wallet's connector in a sandboxed iframe, so the dApp never ships wallet code.

The app creates **one** `NearConnector` per page load (`network` from `NEXT_PUBLIC_NEAR_NETWORK`, RPC from `NEXT_PUBLIC_RPC_URL`) and exposes it through `useNear()`, whose surface mirrors `near-connect-hooks`' `useNearWallet` (`signedAccountId`, `loading`, `connect(walletId?)`, `signOut`, `signAndSendTransaction(s)`, `signMessage`).

> **Why not `near-connect-hooks` directly?** Version 1.1.6 pins `@hot-labs/near-connect` 0.11 and `function-call-key-plugin` 1.x internally, creates its own connector, and its `signIn()` always opens the stock picker — it cannot take a configured plugin or a `walletId`. Our connect sheet needs both, so the provider is ~200 lines of our own code on the same libraries.

### The connect sheet

`components/wallet/connect-sheet.tsx` replaces the stock popup. It is a bottom drawer on phones and a dialog on larger screens:

1. **Recommended for new users** — two large rows, in plain language:
   - **HOT Wallet** (`hot-wallet`) — MPC wallet via Telegram mini-app, mobile app or extension.
   - **Meteor Wallet** (`meteor-wallet`) — web + extension wallet, quick account creation, supports testnet.
2. **Other options** — every remaining manifest wallet that declares support for the current network; wallets without testnet support are listed (collapsed) as "not available on testnet yet".
3. A one-paragraph note on the function-call key (§3) so the first approval is not a surprise.

The sheet never says "seed phrase" except to say farmers don't need one: *"Akun Pratala Anda dijaga oleh dompet MPC — tidak ada seed phrase untuk petani."*

### Testnet caveat (verified 2026-11-07)

The live NEAR Connect manifest marks **HOT Wallet without `features.testnet`**, so `NearConnector.availableWallets` filters it out on testnet. Pratala still shows HOT first and calls `connector.connect({ walletId: "hot-wallet" })` directly, with an honest note under it: *testnet support in HOT is not official yet — for this demo, Meteor works best.* Meteor, Intear, Nightly, Ledger, Unity and NEAR CLI declare testnet support. On mainnet HOT is fully supported.

## 2. Why MPC wallets for farmers

HOT Wallet is a non-custodial **MPC** wallet: the signing key is split between the user's device/Telegram session and HOT's MPC network, so no single party (including the user) holds a full private key, and there is no 12-word phrase to write down or lose. For a smallholder farmer with a basic Android phone and Telegram, that is the difference between "possible" and "not possible". Meteor is the closest alternative with first-class testnet support.

## 3. Function-call keys — seamless signing

`function-call-key-plugin` 2.2 is registered on the connector:

```ts
createAccessKeyPlugin({
  network, providers,
  signIn: { contractId: NEXT_PUBLIC_LOTS_CONTRACT_ID, methodNames: FC_METHODS, allowance: "250000000000000000000000" }, // 0.25 NEAR
});
```

At sign-in the wallet is asked once to add a **limited access key** for the lots contract. The private half stays in the browser (`localStorage`, key `access_key::plugin::<network>::<account>`). After that the plugin signs locally — **no wallet window** — whenever *all* of these hold:

- the receiver is the lots contract,
- every action is a `FunctionCall` to a method in `FC_METHODS`,
- every call attaches **zero** deposit.

`FC_METHODS` = `attest_field, attest_coop, weigh_in, declare_failure, list_lot, update_price, delist_lot, cancel_lot, claim_payout, claim_refund, claim_fee` (INTERFACES §3). In practice: field agents, co-ops and warehouses sign attestations silently, farmers set prices and withdraw payouts silently, holders claim refunds silently.

| Action | Contract | Deposit | Who signs |
| --- | --- | --- | --- |
| `register_lot` | lots | 0.1 NEAR (storage) | **wallet** |
| fund a lot = `ft_transfer_call` | pUSDC | 1 yocto | **wallet** |
| `nft_transfer` | lots | 1 yocto | **wallet** |
| faucet (`storage_deposit` + `faucet`) | pUSDC | storage | **wallet** |
| owner settings (`add_role`, `set_fee_bps`, …) | lots | 0 | **wallet** (deliberately outside `FC_METHODS`) |
| attestations, price, claims | lots | 0 | **FC key, silent** |

What a function-call key **cannot** do: move NEAR or tokens, attach any deposit, call other contracts, add/delete keys, or spend more than its 0.25 NEAR gas allowance. If the allowance runs out or the key was deleted on-chain, the plugin falls back to the wallet (and removes a dead key). Signing out removes the local key. The account menu shows "Tanda tangan otomatis aktif" when a key is present.

## 4. Backend session — NEP-413

Off-chain features (photo uploads, inbox, profile, supplier listings) use a cookie session. Login is a signed message, not a password:

1. `POST /api/auth/challenge { accountId }` → `{ nonce (base64, 32 bytes), message, recipient }`
2. `wallet.signMessage({ message, recipient, nonce })` (NEP-413)
3. `POST /api/auth/verify { accountId, publicKey, signature, nonce }` → httpOnly `pratala_session` cookie; the backend checks the signature and that `publicKey` is a full-access key of the account (`near-api-js/nep413`).

Chain features never require it. Wallets that cannot sign messages get a clear note and keep working on-chain.

## 5. Not used / roadmap

- **FastAuth** — deprecated (repository archived 2026-07-28); not used.
- **HOT Kit "Connect via Google"** (`@hot-labs/kit`) — creates a HOT MPC account from a Google login; experimental upstream. Roadmap item for farmers without Telegram. Privy and Web3Auth are the production-grade alternatives NEAR docs point to.
- **Chain Signatures** (`v1.signer` / `v1.signer-prod.testnet`) — would let a Pratala account sign on other chains (e.g. pay a supplier on Base). Outbound only; roadmap.
- **Cross-chain checkout** today is a NEAR Intents 1Click **mainnet dry quote** shown on `/checkout/[id]`; no deposit address is created because the demo contracts live on testnet. See [`INTENTS.md`](INTENTS.md).
