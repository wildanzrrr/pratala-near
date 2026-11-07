# Demo video script (3:00) and X post

This is the script for the submission video. It follows the core journeys in [`PLAN.md`](PLAN.md) §1. Accounts, lots and numbers come from `scripts/04-seed-demo.sh`. Read the real ids from `deploy/testnet.json`. Below, `<sfx>` is its `actor_suffix` and `<root>` is `accounts.root`.

## 0. Before recording (not in the video)

1. `scripts/05-verify-demo.sh` → `all checks passed`. lot-1 is Settled (the finished example), lot-2 is Listed and lot-3 is FieldVerified.
2. Put the demo actors in browser wallets. Their keys are in the near-cli-rs keychain, so export each one with `near account export-account <id> using-private-key network-config testnet` and import it into Meteor or MyNearWallet. Use a separate browser profile per role, or one wallet with account switching. These are **testnet-only** keys; never paste them anywhere public.
   - Farmer `pratala-farmer1-<sfx>.testnet` (mobile width, Bahasa)
   - Field agent `pratala-agent1-<sfx>.testnet`
   - Co-op `pratala-coop1-<sfx>.testnet`
   - Warehouse `pratala-warehouse1-<sfx>.testnet`
   - Buyer `pratala-buyer1-<sfx>.testnet` (already holds pUSDC from the seed; top up at `/faucet` if needed)
   - Second holder `pratala-investor2-<sfx>.testnet`
3. Have two photos ready: a rice paddy photo (field visit) and a scale-ticket photo reading **900 kg, grade A** (weigh-in).
4. The recording creates a fresh lot, which will be **lot-4** after the seed. Use the same numbers as lot-1 (1,000 kg at 0.45 pUSDC/kg), so the payout screen shows the reference split: 396.90 / 8.10 / 45.00.
5. Have `NEAR_AI_API_KEY` set in the backend so the AI check badge appears. If the key is missing, the UI says "AI check unavailable". Say so on camera instead of hiding it.
6. Screen at 1280×800 for desktop roles. Use device emulation at 390 px for the farmer and the field agent.

## 1. Script

| Time | Screen (account) | Exact clicks | Voice-over |
| --- | --- | --- | --- |
| 0:00–0:15 | Landing `/` | Scroll the hero and the live stats from chain | "Smallholder rice farmers in Indonesia usually sell to a middleman, the *tengkulak*, at harvest, for whatever price he sets. That middleman is often also their only source of money before the harvest. Pratala lets a buyer pre-fund a verified harvest directly, and pays the farmer the moment it is weighed." |
| 0:15–0:40 | `/onboarding` → `/farmer/new` (farmer1, 390 px) | Connect → HOT Wallet or Meteor → "Saya petani" → profile. Then wizard step 1: add plot photo, allow location. Step 2: crop **Padi / rice**, variety **IR64**, region **Karawang, Jawa Barat**, **1000 kg**, harvest month two months out. Step 3: review → **Daftarkan** → approve in wallet (0.1 NEAR storage). | "The farmer registers a harvest projection in Bahasa, from a phone: 1,000 kilos of IR64 rice, two months out. One wallet approval. That projection is now an NFT on NEAR, owned by the farmer." Show status "Menunggu kunjungan penyuluh". |
| 0:40–1:05 | `/verify` (agent1, 390 px) | Open the new lot-4 task → camera / upload the paddy photo → wait for the AI check badge (pass, crop rice, stage) → add note → **Attest** (no wallet popup: function-call key) | "A field agent visits the plot. The photo goes through an AI check on NEAR AI Cloud, which looks for crop match, growth stage and GPS plausibility. The verdict is advisory and a human still signs. The response's hash is written on-chain with the attestation, and the badge links to NEAR AI's signature verification." |
| 1:05–1:20 | `/verify` (coop1) | Open lot-4 → compare evidence → **Approve** | "The cooperative reviews it. The contract refuses a co-op signature from the same account as the field agent. Now it's CoopVerified." |
| 1:20–1:30 | `/farmer` (farmer1) | lot-4 → set price **0.45 pUSDC/kg** → **List** → **Share** (copies the pay link `/lot/lot-4`) | "The farmer lists it at 0.45 pUSDC per kilo and gets a pay link." |
| 1:30–1:55 | `/lot/lot-4` → `/checkout/lot-4` (buyer1) | Open the pay link → show the trust panel (2 attestations + AI badge) → **Fund 450 pUSDC** → approve the `ft_transfer_call` in the wallet → receipt `/receipt/<tx>` → **Lihat bukti** opens nearblocks | "A buyer opens the link, checks the evidence and pays 450 pUSDC. One `ft_transfer_call`: the stablecoin goes into escrow in the lot contract, and the NFT moves from the farmer to the buyer in the same transaction." Briefly show tab B: "Pay from any chain shows a live NEAR Intents quote. Intents is mainnet-only, so on testnet this is a dry quote, labelled as one." |
| 1:55–2:15 | `/verify` (warehouse1) | lot-4 → upload the scale-ticket photo → AI prefills **900 kg, grade A** → settlement preview: farmer **396.90**, platform **8.10**, buyer refund **45.00** → **Weigh in** | "At the warehouse the scale reads 900 kilos, not 1,000. The contract settles on the delivered weight. Farmer: 396.90. Platform fee, 2%: 8.10. The 45.00 for the missing 100 kilos goes back to whoever holds the NFT." |
| 2:15–2:30 | `/farmer` (farmer1) → `/portfolio` (buyer1) → `/exports` | Farmer: **Tarik 396.90 pUSDC** → paid, explorer link. Buyer: shows **Claim refund 45.00**. Then `/exports` → **Download CSV** → open in a spreadsheet | "The farmer withdraws 396.90 straight away. The buyer sees a 45.00 refund to claim. The bookkeeper gets a CSV in which every row links to its transaction." |
| 2:30–2:50 | `/portfolio` (buyer1) → `/portfolio` (investor2) | Buyer: lot-4 → **Transfer NFT** → `pratala-investor2-<sfx>.testnet` → approve (1 yocto). Switch to investor2: the lot shows **Claim refund 45.00** → claim → paid. Back on buyer1: refund gone. `/lot/lot-4` history shows the owner and money timeline | "The NFT *is* the claim. The buyer sells it to someone else, and the 45.00 refund moves with it. The new holder claims it and the old one no longer can. The contract also blocks transfers while a payout is in flight." |
| 2:50–3:00 | Terminal + README | `scripts/05-verify-demo.sh` → `all checks passed` | "Everything here is on NEAR testnet and reproducible from the README. One script checks the same numbers on lot-1. Pratala, built at NEAR HACKATHON." |

Fallbacks if a live step fails on camera: show lot-1 (already Settled) and lot-2 (Listed: fund it as buyer1 instead of lot-4). Show lot-3 (FieldVerified: approve it as coop1). All three exist from the seed.

## 2. What NEAR does (one sentence each, for the voice-over or the post)

- The harvest lot is a **NEP-171 NFT** whose current owner holds the refund right.
- The escrow uses the **NEP-141 `ft_transfer_call` → `ft_on_transfer`** pattern: funds and the NFT move in one transaction, and invalid payments are refunded automatically.
- **Function-call access keys** let field agents and farmers sign routine actions without wallet popups. **NEAR Connect** brings HOT Wallet (MPC), Meteor and others.
- **NEAR AI Cloud** runs the evidence check, and its response hash is anchored on-chain. **NEAR Intents** 1Click quotes cross-chain checkout (mainnet, dry).

## 3. X post draft

Main post (≤ 280 characters):

> Rice farmers in Indonesia sell to middlemen who set the price.
>
> Pratala: buyers pre-fund a verified harvest on NEAR. At weigh-in the farmer withdraws 396.90 pUSDC in one tap. The refund for the 100 kg shortfall goes to the lot NFT's holder.
>
> Built at NEAR HACKATHON @NEARProtocol #NEARHackathon

Attach: the 3:00 video.

Reply thread:

1. "How it works: field agent, co-op and warehouse each sign an attestation. The lot is an NFT that holds stablecoin escrow (NEP-171 + NEP-141 `ft_transfer_call`). Sell the NFT and the refund right moves with it."
2. "Field agents sign with function-call keys (no wallet popups). Photos get an advisory AI check on NEAR AI Cloud, and its hash is stored on-chain. Cross-chain checkout quotes come from NEAR Intents."
3. "Try it on testnet: <live URL> · code + 5-minute walkthrough: <repo URL>"
4. "Next: pilot with one cooperative in Karawang. Question for builders: how would you replace our allowlisted verifiers with something less trusted, without making it harder for farmers? @NearLegion @NearBuilders"

Before posting, check: it says built at NEAR HACKATHON, tags @NEARProtocol and #NEARHackathon, and attaches the video. It leads with the user problem, shows one action → result moment (the 396.90 withdrawal), says concretely what NEAR does, and ends with a link and a question. The human posts it. Agents do not post to X.
