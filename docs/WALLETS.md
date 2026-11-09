# Wallets, signing and identity

How people sign in to Pratala, which actions pop a window and which don't, and what is on the roadmap. Code: [`frontend/providers/near-provider.tsx`](../frontend/providers/near-provider.tsx), [`frontend/lib/fastauth/`](../frontend/lib/fastauth), [`frontend/components/wallet/`](../frontend/components/wallet), [`frontend/lib/near/contracts.ts`](../frontend/lib/near/contracts.ts).

## 1. Sign in with email — NEAR Auth (SSO → MPC)

The hero action in the connect sheet. A farmer signs in with **email, Google, Apple or a passkey** and gets a genuine, non-custodial NEAR account — no seed phrase, no extension, no gas to manage. This is [NEAR Auth](https://docs.auth.near.org), the official FastAuth successor (the old FastAuth repo was archived 2026-07-28; Web3Auth was also evaluated and rejected — Consensys acquired it in June 2025, folded it into MetaMask Embedded Wallets, and its service had a security pause on 2026-11-06).

**How a login maps to an account.** The Auth0 identity (`sub`) deterministically derives an **MPC key** on `v1.signer-prod.testnet` (`derived_public_key`, path `jwt#https://login.testnet.fast-auth.com/#<sub>`); nobody — including this app — ever holds the key. On first login the user **chooses their account name** in onboarding (2–32 chars, live availability check against the chain; the email's local part is pre-filled as a suggestion) and becomes `<name>.sponsor.pratala.testnet`. The backend records identity → account, so `POST /fastauth/resolve-account` resolves the same account on every later login and device. Nobody — including this app — ever holds the key: signing happens on the MPC network after the fast-auth contract's on-chain guard verifies the Auth0 JWT.

**Who pays for what.** NEAR charges gas to the transaction signer, and `register_lot` needs a 0.1 NEAR attached deposit, so a brand-new account cannot transact on its own. Pratala sponsors it:

- **Account creation + gas seed** — the backend's sponsor wallet (`sponsor.pratala.testnet`, key in gitignored `config/keys/sponsor.pratala.testnet.json`) sends one `CreateAccount + AddKey(full access, the MPC key) + Transfer(0.5 NEAR)` batch, once per login and once per account ever (`SponsoredAccount` table). That seed covers the registration deposit and gas for the whole demo.
- **MPC signature calls** — each signed action needs a `sign` call on `fast-auth.testnet` (the guard verifies the JWT on-chain, the MPC network signs). The backend relays that call, so the platform pays its gas too (`POST /api/fastauth/sign-tx`).

**The user experience, cadence of windows:**

1. Sign-in = one full-page redirect to `login.testnet.fast-auth.com` (redirect, not popup — nothing for a popup blocker to break) and back. Returning users are silent; brand-new logins land in onboarding, where the account name is chosen before the account is created (`u…` prefixed names predate this and keep working).
2. Onboarding is not optional: anyone signed in without a profile — wallet or SSO — is kept on `/onboarding` by the app-level gate until registration completes (`components/common/onboarding-gate.tsx`).
3. The first on-chain action that qualifies for quick signing (§4) adds a **local function-call key** through one confirmation window — after that, attestations, price changes and claims sign invisibly, in the same click that added the key. Declining or blocking that one window stops the action ("You cancelled the approval" / "allow popups" respectively) — it never chains a second surprise window.
4. Actions that move money (`register_lot`, faucet, funding, NFT transfer) open **one confirmation window per action** (Auth0 shows what will be signed). No seed phrase is ever shown or needed.

**Backend session without NEP-413.** The SDK cannot sign arbitrary NEP-413 payloads yet, so `POST /api/auth/verify-sso` binds the session differently: the Auth0 token is verified against the tenant's JWKS, the backend re-derives the expected MPC public key from the token's `sub` itself (`derived_public_key` view call), and checks that key is a **full-access key of the claimed account** on-chain. Regular-wallet users keep the NEP-413 flow (§4) unchanged.

**Testnet wiring** (env-switchable): `fast-auth.testnet` + `v1.signer-prod.testnet` contracts, shared Auth0 dev client `np8paqIpMWmNbzT4xAvOOapZBjsOpptl` on `login.testnet.fast-auth.com`. Mainnet needs approved credentials (apply at docs.auth.near.org) and different contract ids — see `backend/.env.example` and `frontend/lib/env.ts`.

## 2. Existing NEAR wallets (NEAR Connect)

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

The sheet never says "seed phrase" or "wallet" in its own copy; it explains the MPC benefit in plain words: *"Pick an account provider below. HOT keeps your key split across several parties, so there is no secret phrase to write down."*

### Testnet caveat (verified 2026-11-07)

The live NEAR Connect manifest marks **HOT Wallet without `features.testnet`**, so `NearConnector.availableWallets` filters it out on testnet. Pratala still shows HOT first and calls `connector.connect({ walletId: "hot-wallet" })` directly, with an honest note under it: *testnet support in HOT is not official yet — for this demo, Meteor works best.* Meteor, Intear, Nightly, Ledger, Unity and NEAR CLI declare testnet support. On mainnet HOT is fully supported.

## 3. Why MPC keys for farmers

HOT Wallet is a non-custodial **MPC** wallet: the signing key is split between the user's device/Telegram session and HOT's MPC network, so no single party (including the user) holds a full private key, and there is no 12-word phrase to write down or lose. For a smallholder farmer with a basic Android phone and Telegram, that is the difference between "possible" and "not possible". Meteor is the closest alternative with first-class testnet support.

## 4. Function-call keys — seamless signing

Wallet users get the key from `function-call-key-plugin` 2.2 registered on the connector; email users get an equivalent local key added through one MPC confirmation on their first silent-eligible action (`lib/fastauth/signer.ts`):

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

What a function-call key **cannot** do: move NEAR or tokens, attach any deposit, call other contracts, add/delete keys, or spend more than its 0.25 NEAR gas allowance. If the allowance runs out or the key was deleted on-chain, the plugin falls back to the wallet (and removes a dead key). Signing out removes the local key. The account menu shows "Automatic signing on" when a key is present.

## 5. Backend session — NEP-413 (wallet path)

Off-chain features (photo uploads, inbox, profile, supplier listings) use a cookie session. Login is a signed message, not a password:

1. `POST /api/auth/challenge { accountId }` → `{ nonce (base64, 32 bytes), message, recipient }`
2. `wallet.signMessage({ message, recipient, nonce })` (NEP-413)
3. `POST /api/auth/verify { accountId, publicKey, signature, nonce }` → httpOnly `pratala_session` cookie; the backend checks the signature and that `publicKey` is a full-access key of the account (`near-api-js/nep413`).

Chain features never require it. Wallets that cannot sign messages get a clear note and keep working on-chain.

## 6. Not used / roadmap

- **NEAR Auth mainnet** — needs approved Auth0 credentials (apply at docs.auth.near.org); testnet uses the shared dev client. Post-hackathon.
- **SMS/phone login** — the shared testnet tenant offers email/Google/Apple/passkey. A custom Auth0 tenant could add phone; the pitch doc's "log in with a phone number" is served by email today.
- **Gasless delegate actions** — `signAndSendDelegateAction` in the SDK would remove even the user-paid gas for broadcast transactions; the 0.5 NEAR seed covers it today, so relaying is a future optimization, not a need.
- **FastAuth** — the original repo (archived 2026-07-28); superseded by NEAR Auth, which we ship.
- **Web3Auth** — rejected: acquired by Consensys (2025-06), docs now redirect to MetaMask Embedded Wallets, and its service had a security pause on 2026-11-06.
- **HOT Kit "Connect via Google"** (`@hot-labs/kit`) — superseded for our use case by NEAR Auth.
- **Chain Signatures** (`v1.signer` / `v1.signer-prod.testnet`) — the same MPC network NEAR Auth uses; could let a Pratala account sign on other chains. Outbound only; roadmap.
- **Cross-chain checkout** today is a NEAR Intents 1Click **mainnet dry quote** shown on `/checkout/[id]`; no deposit address is created because the demo contracts live on testnet. See [`INTENTS.md`](INTENTS.md).
