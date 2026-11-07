# How the NFT carries money and control

Track 10, "NFTs That Do Something". Each Pratala harvest lot is a NEP-171 NFT (`token_id = lot_id`) in the `harvest-lot` contract. Once a buyer funds the lot, the NFT **is** the investor position: whoever owns it when the lot settles can pull the under-delivery or crop-failure refund, and only that account. Selling the NFT sells the position. This page explains how money and control pass on transfer, what stops a seller keeping access, and which tests prove each point. The method reference is in [`CONTRACTS.md`](CONTRACTS.md).

## 1. What the NFT controls, by status

| Status | NFT owner | Can the NFT move? | Money behind it | What the owner can do |
| --- | --- | --- | --- | --- |
| Registered → CoopVerified, Listed | farmer | **No** (stays with the farmer) | none | list / delist / cancel (farmer) |
| Cancelled | farmer | **No**, permanently | none | nothing |
| Funded | buyer (moved by funding) or whoever bought it since | Yes | full escrow held for this lot | sell / gift / approve a marketplace |
| Settled | current owner | Yes, except while a payout is in flight | `claims.holder = escrow − gross` (under-delivery refund) | `claim_refund` |
| Refunded (crop failure) | current owner | Yes, except while a payout is in flight | `claims.holder = escrow` | `claim_refund` |

The farmer's and treasury's claims are tied to the lot, not to the NFT, so trading the NFT never touches what the farmer is owed.

## 2. How money passes with the NFT

1. **Funding hands over the NFT atomically with the money.** The buyer calls pUSDC `ft_transfer_call(lots, total, {"action":"fund","lot_id"})`. In the same receipt `ft_on_transfer` records the escrow and calls the standard's `internal_transfer(farmer → buyer)`. If any check fails the call panics, the NFT does not move and pUSDC refunds everything. There is no state where the buyer has paid but does not hold the NFT, or holds it without the escrow.
2. **The refund right is never stored against an account.** `Lot` has no "holder" field. `funder` is history only and is never used for payouts. `claim_refund` resolves the recipient from the NFT `owner_by_id` map **at call time** and requires `predecessor == owner`. Whoever owns the NFT at that moment is paid, and nobody else.
3. **Settlement fixes amounts, not recipients.** `weigh_in` and `declare_failure` write `claims.{farmer, treasury, holder}`. They do not decide who receives the holder part; the NFT does, at claim time.

## 3. What stops a seller keeping access

| Mechanism | Where | Effect |
| --- | --- | --- |
| Holder resolved from `owner_by_id` at claim time | `escrow.rs` `claim_refund` / `holder_of` | After a sale the seller's `claim_refund` fails with `only the current NFT holder can claim the refund`. |
| `claim_lock` while a payout is in flight | `escrow.rs` `start_claim`, `nft.rs` `assert_transferable` | The claim is zeroed and the lot locked **before** `ft_transfer` is sent. Until the callback runs, `nft_transfer` / `nft_transfer_call` fail with `NFT cannot move while a payout is in flight`. A seller cannot start pulling the refund and then sell an NFT whose money is already leaving. |
| Callback restores and unlocks | `escrow.rs` `on_claim_resolved` | If `ft_transfer` fails (e.g. the recipient is not registered on pUSDC), the claim is restored and the lock cleared, so the position is neither lost nor frozen. The callback is `#[private]` and never panics. |
| Approvals cleared on every transfer | near-contract-standards 5.30.1 `internal_transfer` | A marketplace approval granted by a previous owner (including the farmer before funding) is removed when the NFT moves, so the old owner's delegate cannot pull the NFT back. |
| No transfer before funding | `nft.rs` `assert_transferable` | The farmer cannot sell or give away the NFT outside the funding path, so the funding transfer always comes from the farmer and the buyer always receives it. |
| Cancelled lots frozen | `nft.rs` `assert_transferable` | A cancelled lot's NFT cannot circulate as if it carried value. |
| Guard on both entry points | `nft.rs` | `nft_transfer` and `nft_transfer_call` both run `assert_transferable`; approved-account transfers use the same entry points, so approvals cannot bypass it. |

### The mid-payout window

A claim spans three receipts: (1) `claim_*` on the lots contract sets `claim_lock`, zeroes the claim and schedules (2) `ft_transfer` on pUSDC, whose result reaches (3) `on_claim_resolved` back on the lots contract, which clears the lock. Any `nft_transfer` that executes on the lots contract between (1) and (3) sees `claim_lock = true` and is rejected.

Two independent transactions cannot be ordered reliably inside that window in the sandbox, so the window is proven two ways:

- **Sandbox, deterministic** (`tests/transfer.rs`): one transaction with two actions, `[claim_refund, nft_transfer]`, signed by the holder. Actions of one transaction run in the same receipt, so `nft_transfer` executes after `claim_refund` has set the lock and before the `ft_transfer` promise is even dispatched. It is rejected with the lock error, and because the panic reverts the whole receipt the claim is untouched (asserted).
- **Unit** (`src/test.rs` `claim_sets_lock_and_blocks_transfer_until_callback`): calls `claim_refund`, asserts the lock is set and the claim zeroed, asserts `nft_transfer` and a second claim both fail, then runs `on_claim_resolved` with a failed promise result and asserts the claim is restored, the lock cleared, the escrow unchanged, `payout_claimed{ok:false}` emitted, and that the NFT can move again.

## 4. Threat model

| # | Threat | Mitigation | Proven by |
| --- | --- | --- | --- |
| T1 | Seller sells the funded NFT, then claims the refund anyway. | Recipient = `owner_by_id` at call time; caller must be that owner. | `tests/transfer.rs` `refund_follows_the_nft_and_lock_blocks_mid_payout_sale`; unit `previous_holder_cannot_claim_refund` |
| T2 | Seller starts a refund payout, then sells the NFT while the money is in flight. | Claim zeroed and `claim_lock` set before `ft_transfer`; transfers rejected while locked. | `tests/transfer.rs` (batch `[claim_refund, nft_transfer]`); unit `claim_sets_lock_and_blocks_transfer_until_callback` |
| T3 | Payout fails (recipient not storage-registered) and the money or the NFT is stuck. | Callback restores the claim and always clears the lock; recipient registers and claims again. | `tests/transfer.rs` (investor2 unregistered → `ok:false` → register → paid 45 pUSDC); unit (same test) |
| T4 | Previous owner keeps a marketplace approval and pulls the NFT back. | Standard `internal_transfer` clears approvals on every transfer, including the funding transfer. | `tests/transfer.rs` `nft_stays_with_farmer_until_funded_and_approvals_are_cleared` (`Sender not approved`) |
| T5 | Farmer sells or moves the NFT before funding, then takes the buyer's money too. | NFT non-transferable before Funded; funding moves it from the farmer. | unit `nft_not_transferable_before_funding`; `tests/transfer.rs` |
| T6 | Cancelled lot's NFT is sold as if it had value. | NFT non-transferable when Cancelled. | unit `nft_not_transferable_when_cancelled`; `tests/transfer.rs` |
| T7 | Fake token "funds" a lot. | `ft_on_transfer` requires `predecessor == usdc_contract`. | unit `funding_rejects_other_tokens` |
| T8 | Double funding, under-funding, malformed msg, farmer self-funding. | Status, amount, msg and sender checks panic, so pUSDC refunds in full. | `tests/refunds.rs` `invalid_funding_is_refunded_in_full`; unit funding tests |
| T9 | Re-entrant or concurrent double claim. | Claim zeroed and lock set before the promise; second claim fails `a payout for this lot is in flight` / `nothing to claim`. | unit `claim_sets_lock_and_blocks_transfer_until_callback`; `tests/happy_path.rs` (repeat claims rejected) |
| T10 | Anyone calls `on_claim_resolved` to fake a payout or unlock. | `#[private]`: only the contract itself can call it. | macro-enforced; reviewed against `near-contract-audit` "non-private callback" |
| T11 | Callback runs out of gas, leaving the lot locked. | Claims require ≥ 40 Tgas (15 transfer + 10 callback + own execution). | unit `claim_requires_gas_for_callback` |
| T12 | Owner raises the fee after a buyer funded. | `fee_bps` frozen on the lot at funding. | unit `fee_is_frozen_at_funding` |
| T13 | Pause traps investor money. | Pause never blocks claims, crop-failure refunds or NFT transfers. | unit `claims_stay_open_while_paused`; `tests/access.rs` |
| T14 | Same person verifies twice, or a farmer verifies their own lot. | Coop reviewer ≠ field signer; verifiers ≠ farmer. | `tests/access.rs`; unit `coop_cannot_be_field_signer`, `farmer_cannot_self_attest` |

### Residual risks (accepted, documented)

- **`nft_transfer_call` to an untrusted receiver.** While the receiver's `nft_on_transfer` runs, the receiver owns the NFT and can pull the refund before returning the NFT; the standard resolver then gives the NFT back to the sender without the money. Use `nft_transfer_call` only with receiver contracts you trust. Plain `nft_transfer` has no such window.
- **Holder that cannot call.** If the NFT is sent to an account or contract that cannot sign `claim_refund`, its refund stays in escrow. Nobody else can take it.
- **Verifier trust.** Attesters are allowlisted by the owner; the contract checks who signed and that they are distinct, not whether the evidence is true. Evidence hashes and the optional AI-check hash make the record auditable off-chain.
- **Owner methods take no deposit.** `add_role`, `set_fee_bps`, `set_treasury` and `set_paused` follow `INTERFACES.md` (0 deposit). A function-call key issued for *all* methods would therefore reach them; front-ends must restrict function-call keys to the method list in `INTERFACES.md`.
- **No upgrade path.** Fixes require a redeploy with the account's full-access key.
