# How the NFTs carry money and control

Track 10, "NFTs That Do Something". A Pratala harvest lot is sold **by the kilogram**. The lot itself is a NEP-171 certificate NFT (`token_id = lot_id`) that stays with the farmer; every purchase mints the buyer a **share NFT** (`"{lot_id}:{n}"`, titled `"{kg} kg of {crop} · {lot_id}"`) for the kg bought. A share NFT **is** the investor position: whoever owns it when the lot settles can pull that slice's pro-rata refund, exactly once, and only that account. Selling a share sells the position. This page explains how money and control pass on transfer, what stops a seller keeping access, and which tests prove each point. The method reference is in [`CONTRACTS.md`](CONTRACTS.md).

## 1. What each NFT controls, by status

| Status | Lot certificate | Share NFTs | Money behind shares | What the holder can do |
| --- | --- | --- | --- | --- |
| Registered → CoopVerified | farmer, cannot move | — | none | list / delist / cancel (farmer) |
| Listed (funding open) | farmer, cannot move | minted per purchase, **freely transferable** | escrow grows kg by kg | sell / gift / approve a marketplace |
| Cancelled | farmer, permanently frozen | — (cancellation requires `sold_kg == 0`) | none | nothing |
| Funded (sold out or closed early) | farmer, transferable | transferable | full escrow held for the lot | sell / gift / approve a marketplace |
| Settled | transferable receipt | transferable, but claimed shares are spent | each share: `floor(holder_pool × kg / sold_kg)` | `claim_refund(share_id)` once |
| Refunded (crop failure) | transferable receipt | transferable, but claimed shares are spent | each share: `floor(escrow × kg / sold_kg)` | `claim_refund(share_id)` once |

The farmer's and treasury's claims are tied to the lot, not to any NFT, so trading shares never touches what the farmer is owed. A claimed share stays with its owner as a receipt and can no longer pay out.

## 2. How money passes with the share NFT

1. **The mint hands over the position atomically with the money.** The buyer calls pUSDC `ft_transfer_call(lots, kg × price, {"action":"fund","lot_id","kg"})`. In the same receipt `ft_on_transfer` adds the escrow and mints the share NFT to the buyer (`internal_mint_with_refund`, contract-paid storage). If any check fails the call panics, nothing is minted and pUSDC refunds everything. There is no state where the buyer has paid but holds no share, or holds a share without escrow behind it.
2. **The refund right is never stored against an account.** Neither `Lot` nor `Share` stores an owner; `share.claimed` is a one-time debit flag only. `claim_refund(share_id)` resolves the recipient from the NFT `owner_by_id` map **at call time** and requires `predecessor == owner`. Whoever owns the share at that moment is paid, and nobody else — and each share pays exactly once.
3. **Settlement fixes amounts, not recipients.** `weigh_in` and `declare_failure` snapshot `holder_pool` and write `claims.{farmer, treasury, holder}` (holder = Σ per-share floor entitlements; rounding dust joins the treasury claim so the parts sum to the escrow). They do not decide who receives the holder part; the share NFTs do, at claim time.

## 3. What stops a seller keeping access

| Mechanism | Where | Effect |
| --- | --- | --- |
| Holder resolved from `owner_by_id` at claim time | `escrow.rs` `claim_refund` / `share_owner` | After a sale the seller's `claim_refund` fails with `only the share NFT owner can claim its refund`. |
| Per-share `claimed` flag | `Lot.shares` | A refund is paid once per share; the second claim fails `this share's refund was already claimed` even after the NFT moves on. |
| `claim_lock` while a payout is in flight | `escrow.rs` `start_claim`, `nft.rs` `assert_transferable` | The claim is deducted and the lot locked **before** `ft_transfer` is sent. Until the callback runs, `nft_transfer` / `nft_transfer_call` on any token of that lot fail with `NFT cannot move while a payout is in flight`. A seller cannot start pulling a refund and then sell a share whose money is already leaving. |
| Callback restores and unlocks | `escrow.rs` `on_claim_resolved` | If `ft_transfer` fails (e.g. the recipient is not registered on pUSDC), the claim is restored, the share unmarked and the lock cleared, so the position is neither lost nor frozen. The callback is `#[private]` and never panics. |
| Approvals cleared on every transfer | near-contract-standards 5.30.1 `internal_transfer` | A marketplace approval granted by a previous owner is removed when the share moves, so the old owner's delegate cannot pull it back. |
| No lot-certificate transfer before funding closes | `nft.rs` `assert_transferable` | The farmer cannot sell or give away the certificate outside the funding path; share NFTs mint only from paid purchases, so a share always has escrow behind it. |
| Cancelled lots frozen | `nft.rs` `assert_transferable` | A cancelled lot's certificate cannot circulate as if it carried value (and cancellation requires `sold_kg == 0`, so no share ever exists on a cancelled lot). |
| Guard on both entry points | `nft.rs` | `nft_transfer` and `nft_transfer_call` both run `assert_transferable`; approved-account transfers use the same entry points, so approvals cannot bypass it. |

### The mid-payout window

A claim spans three receipts: (1) `claim_*` on the lots contract sets `claim_lock`, deducts the claim and schedules (2) `ft_transfer` on pUSDC, whose result reaches (3) `on_claim_resolved` back on the lots contract, which clears the lock. Any `nft_transfer` that executes on the lots contract between (1) and (3) sees `claim_lock = true` and is rejected.

Two independent transactions cannot be ordered reliably inside that window in the sandbox, so the window is proven two ways:

- **Sandbox, deterministic** (`tests/transfer.rs`): one transaction with two actions, `[claim_refund, nft_transfer]`, signed by the share holder. Actions of one transaction run in the same receipt, so `nft_transfer` executes after `claim_refund` has set the lock and before the `ft_transfer` promise is even dispatched. It is rejected with the lock error, and because the panic reverts the whole receipt the claim is untouched (asserted).
- **Unit** (`src/test.rs` `claim_sets_lock_and_blocks_share_transfer_until_callback`): calls `claim_refund`, asserts the lock is set, the pool debited and the share marked, asserts the share transfer and a second claim both fail, then runs `on_claim_resolved` with a failed promise result and asserts the claim restored, the share unmarked, the lock cleared, `payout_claimed{ok:false}` emitted, and that the share can move again.

## 4. Threat model

| # | Threat | Mitigation | Proven by |
| --- | --- | --- | --- |
| T1 | Seller sells a share, then claims its refund anyway. | Recipient = `owner_by_id` at call time; caller must be that owner. | `tests/transfer.rs` `refund_follows_the_share_and_lock_blocks_mid_payout_sale`; unit `previous_share_owner_cannot_claim_refund` |
| T2 | Seller starts a refund payout, then sells the share while the money is in flight. | Claim debited and `claim_lock` set before `ft_transfer`; transfers rejected while locked. | `tests/transfer.rs` (batch `[claim_refund, nft_transfer]`); unit `claim_sets_lock_and_blocks_share_transfer_until_callback` |
| T3 | Payout fails (recipient not storage-registered) and the money or the share is stuck. | Callback restores the claim and always clears the lock; recipient registers and claims again. | `tests/transfer.rs` (investor2 unregistered → `ok:false` → register → paid 31.50); unit (same test) |
| T4 | Previous owner keeps a marketplace approval and pulls the share back. | Standard `internal_transfer` clears approvals on every transfer. | `tests/transfer.rs` `lot_nft_stays_with_the_farmer_until_funding_closes` (approvals on the certificate; `Sender not approved`) |
| T5 | Buyer pays but never receives a share. | Mint and escrow credit happen in the same `ft_on_transfer` receipt; any panic refunds everything. | `tests/happy_path.rs` `two_buyers_split_the_harvest_and_escrow_pro_rata` (nft_mint + lot_funded asserted); `tests/refunds.rs` `invalid_funding_is_refunded_in_full` |
| T6 | Share minted with no escrow behind it, or beyond the projected kg. | Shares mint only in `ft_on_transfer` (requires Listed, kg ≤ remaining, amount ≥ kg × price); cancel/delist require `sold_kg == 0`. | unit `funding_rejects_over_remaining`, `delist_rejected_after_first_sale`; sandbox `invalid_funding_is_refunded_in_full` |
| T7 | A share claims twice (or the buyer re-claims after selling). | Per-share `claimed` flag + owner check at claim time. | unit `share_cannot_claim_twice`; sandbox (claimed share rejected) |
| T8 | Fake token "funds" a lot. | `ft_on_transfer` requires `predecessor == usdc_contract`. | unit `funding_rejects_other_tokens` |
| T9 | Double funding of the same kg, under-payment, malformed msg, farmer self-funding. | Status, kg, amount, msg and sender checks panic, so pUSDC refunds in full. | `tests/refunds.rs` `invalid_funding_is_refunded_in_full`; unit funding tests |
| T10 | Buyer funds a lot that is then repriced or cancelled under them. | `update_price` / `delist_lot` / `cancel_lot` require `sold_kg == 0`. | unit `update_price_rejected_after_first_sale`, `delist_rejected_after_first_sale`, `cancel_listed_rejected` |
| T11 | Re-entrant or concurrent double claim. | Claim debited and lock set before the promise; second claim fails `a payout for this lot is in flight` / `nothing to claim`. | unit `claim_sets_lock_and_blocks_share_transfer_until_callback`; `tests/happy_path.rs` (repeat claims rejected) |
| T12 | Anyone calls `on_claim_resolved` to fake a payout or unlock. | `#[private]`: only the contract itself can call it. | macro-enforced; reviewed against `near-contract-audit` "non-private callback" |
| T13 | Callback runs out of gas, leaving the lot locked. | Claims require ≥ 40 Tgas (15 transfer + 10 callback + own execution). | unit `claim_requires_gas_for_callback` |
| T14 | Owner raises the fee after the first buyer funded. | `fee_bps` frozen on the lot at the first sale. | unit `fee_is_frozen_at_first_sale` |
| T15 | Pause traps investor money. | Pause never blocks claims, crop-failure refunds, `close_funding` or NFT transfers. | unit `claims_stay_open_while_paused`, `close_funding_works_while_paused`; `tests/access.rs` |
| T16 | Same person verifies twice, or a farmer verifies their own lot. | Coop reviewer ≠ field signer; verifiers ≠ farmer. | `tests/access.rs`; unit `coop_cannot_be_field_signer`, `farmer_cannot_self_attest` |
| T17 | Share spam bloats contract-paid storage. | ≤ `MAX_SHARES_PER_LOT` (64) purchases per lot; share storage pre-paid by the 48 KB registration reserve; at the cap buyers wait for `close_funding`. | unit `funding_rejected_at_share_cap`, `registration_storage_cost_fits_in_0_6_near` |
| T18 | Partially-funded lot never settles and buyer money is stuck. | `close_funding` (farmer or owner, not blocked by pause) closes a partial listing; sell-out closes automatically. | unit `close_funding_*`; sandbox `partial_close_settles_the_sold_kg_only` |

### Residual risks (accepted, documented)

- **`nft_transfer_call` to an untrusted receiver.** While the receiver's `nft_on_transfer` runs, the receiver owns the share and can pull the refund before returning it; the standard resolver then gives the share back to the sender without the money. Use `nft_transfer_call` only with receiver contracts you trust. Plain `nft_transfer` has no such window.
- **Share holder that cannot call.** If a share is sent to an account or contract that cannot sign `claim_refund`, its slice stays in escrow. Nobody else can take it.
- **Rounding dust.** Per-share entitlements floor; the dust is swept into the treasury claim at settlement (parts always sum to the escrow, tested).
- **Verifier trust.** Attesters are allowlisted by the owner; the contract checks who signed and that they are distinct, not whether the evidence is true. Evidence hashes and the optional AI-check hash make the record auditable off-chain.
- **Owner methods take no deposit.** `add_role`, `set_fee_bps`, `set_treasury` and `set_paused` follow `INTERFACES.md` (0 deposit). A function-call key issued for *all* methods would therefore reach them; front-ends must restrict function-call keys to the method list in `INTERFACES.md`.
- **No upgrade path.** Fixes require a redeploy with the account's full-access key (the fractional model itself required a fresh `lots-v2` deploy).
