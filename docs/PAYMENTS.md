# Payments: a guide for the bookkeeper

This page explains where money sits in Pratala, what each status means, and how to read the CSV export. No crypto knowledge is needed.

## The currency

All amounts are in **pUSDC**, a test stablecoin on the NEAR testnet (1 pUSDC is meant to track 1 US dollar, but on testnet it has no real value). The token has 6 decimals; the API and the CSV show amounts as plain decimals with at least two places, for example `396.90`. Very small amounts keep every digit (`0.000001`) so nothing is rounded away.

## What happens to the money

1. A farmer registers a **lot**: a harvest projection such as 1,000 kg of rice for a given month. Field agent, cooperative and warehouse checks are recorded against it.
2. The farmer **lists** the lot at a price per kg. The lot's funding total is projected kg × price.
3. A buyer **funds** the lot. The pUSDC goes into **escrow** held by the lots contract (`lots.pratala.testnet`), not to the farmer. The buyer receives the lot NFT.
4. At harvest the warehouse **weighs** the delivery. The contract then splits the escrow into three **claims**:
   - the farmer's payout: delivered kg × price, minus the platform fee;
   - the platform fee, for the treasury;
   - a refund to whoever holds the NFT at that moment, for any shortfall.
5. Each party **claims** its share. A claim is a separate transaction that moves the pUSDC out of escrow.
6. If the crop fails, a cooperative declares a failure and the whole escrow becomes a refund claim for the NFT holder.

## Lot statuses

| Lot status | Plain meaning |
| --- | --- |
| Registered / FieldVerified / CoopVerified | Being verified. No money involved yet. |
| **Listed** | Open for funding. **Unpaid**: nobody has paid anything. |
| **Funded** | **Paid into escrow.** The buyer's money is locked in the contract. The farmer has not been paid yet. |
| **Settled** | The harvest was weighed. **Claims are pending**: the amounts are fixed and waiting to be collected. |
| **Paid** (a payment row, not a lot status) | A claim was collected. The money reached the recipient's account. |
| **Refunded** | Crop failure. The escrow is owed back to the NFT holder (pending until they claim it). |
| Cancelled | Withdrawn before funding. No money involved. |

## Payment rows (`GET /api/payments`, `/exports` page)

Each row is one movement of money. Rows are created from the contract's own event logs, so they match the blockchain.

| type | from → to | Created when | Status |
| --- | --- | --- | --- |
| `FUNDING` | buyer → lots contract (escrow) | the lot is funded | `PAID` |
| `PAYOUT` | escrow → farmer | weigh-in | `PENDING`, then `PAID` when the farmer claims |
| `FEE` | escrow → treasury | weigh-in | `PENDING`, then `PAID` when the fee is claimed |
| `REFUND` | escrow → current NFT holder | weigh-in shortfall or crop failure | `PENDING`, then `PAID` when claimed |
| `INPUT_PURCHASE` | farmer → supplier | a seed/fertilizer order is paid | `PAID` |

`FAILED` means a claim transfer did not go through, usually because the receiving account was not registered with the pUSDC token. The claim is restored on-chain; when the recipient claims again the same row turns `PAID`.

The refund goes to whoever holds the NFT **when the claim is made**. If a buyer sells the NFT after funding, the new holder receives the refund; the `to_account` column shows who actually received it.

## The fee

The platform fee is a percentage of the delivered value, in basis points (`fee_bps`; 200 bps = 2%). It is fixed for a lot at the moment the lot is funded, so a later fee change cannot alter a funded deal. It is taken from the farmer's gross amount, never added on top of the buyer's payment.

## Worked example

| | |
| --- | --- |
| Projection | 1,000 kg rice at 0.45 pUSDC/kg |
| Buyer funds | **450.00** pUSDC (escrow) |
| Warehouse weighs | 900 kg delivered |
| Gross value | 900 × 0.45 = 405.00 |
| Fee (200 bps) | 405.00 × 2% = **8.10** → treasury |
| Farmer payout | 405.00 − 8.10 = **396.90** → farmer |
| Refund | 450.00 − 405.00 = **45.00** → NFT holder |

396.90 + 8.10 + 45.00 = 450.00: every unit of the escrow is accounted for.

In the CSV this lot produces four rows: one `FUNDING` (450.00, PAID) and three claim rows (`PAYOUT` 396.90, `FEE` 8.10, `REFUND` 45.00), each `PENDING` until claimed and `PAID` after.

## The CSV export

Download it from the web app's **Exports** page or directly from `GET /api/payments/export.csv` (filters: `?account=<id>&lotId=lot-1&from=2026-11-01&to=2026-11-30`, all optional; `to` includes that whole day).

- Encoding: UTF-8 with a byte-order mark, Windows (CRLF) line endings, so Excel opens it with the right characters.
- Columns, in order:

| Column | Meaning |
| --- | --- |
| `date_utc` | When the status last changed, from the block time, `YYYY-MM-DD HH:MM:SS` in UTC |
| `lot_id` | Lot, e.g. `lot-1` (empty for farm-input purchases) |
| `crop` | Crop of the lot |
| `type` | `FUNDING`, `PAYOUT`, `FEE`, `REFUND`, `INPUT_PURCHASE` |
| `from_account` | Who the money came from (the lots contract for claims) |
| `to_account` | Who the money went to (the lots contract for funding) |
| `amount_pusdc` | Decimal amount, at least 2 dp |
| `status` | `PENDING`, `PAID`, `FAILED` (`REFUNDED` is reserved in the schema and not produced today) |
| `tx_hash` | NEAR transaction that made the movement (empty while pending) |
| `explorer_url` | Link to that transaction on the block explorer |
| `note` | Context: weigh-in kg and grade, excess returned at funding, order memo |

Cells that begin with `=`, `+`, `-` or `@` are prefixed with `'` so a spreadsheet never runs them as formulas.

## Checking a row yourself

Every `PAID` row has an `explorer_url` such as `https://testnet.nearblocks.io/txns/<tx_hash>`. Open it to see the transaction on the public explorer: who signed it, the token transfer and the amount. The explorer is independent of Pratala, so you can use it to check the ledger.

## Limits

- Testnet only: pUSDC is a mock token without real value.
- The ledger is built from transactions the app reports to the API (`POST /api/tx`) plus a periodic check of every lot. A transaction made outside the app appears in the lot's on-chain state but may not get its own ledger row until it is reported.
