# Design — Pratala web

The design system, why it looks the way it does, and the screen map. Source of truth for values: [`frontend/tokens.css`](../frontend/tokens.css). shadcn semantic variables in [`frontend/app/globals.css`](../frontend/app/globals.css) are mapped onto those tokens; components use only the semantic names (`bg-primary`, `text-muted-foreground`, `bg-sunken`, …).

## 1. Brief

| | |
| --- | --- |
| **Audience** | Indonesian smallholder farmers and cooperative verifiers — phone-first, low digital literacy, non-crypto — plus crypto-capable buyers and investors funding harvests |
| **Use case** | Buyer: fund a verified harvest lot. Farmer: register a harvest and get paid |
| **Tone** | Soft-utilitarian, warm and trustworthy, document-like — a well-run cooperative ledger, not a crypto casino |

## 2. Hallmark theme

Generated with the Hallmark skill (default flow, custom route, *tuned* depth), anchored on the `pratala-web3` prototype palette.

```
macrostructure: Narrative Workflow · hero: H2 split diptych (7/5, photo, hairline)
theme: custom · vibe: "cooperative ledger, paddy green, warm paper"
paper oklch(96.2% 0.011 95) · brand oklch(42% 0.085 154) · accent oklch(91% 0.14 119) lime
display: Newsreader (roman only) · body: IBM Plex Sans · outlier: IBM Plex Mono (ledger figures)
axes: light / roman-serif / chromatic-green ~154 · nav: N12 banner + bar · footer: Ft4 dense colophon
```

The stamp sits at the top of `tokens.css`; project memory in `frontend/.hallmark/log.json`.

### Colour

| Token | Value | Role |
| --- | --- | --- |
| `--pt-paper` | `oklch(96.2% 0.011 95)` | Page — warm ledger paper (prototype `#f3f1e9`) |
| `--pt-paper-2` | `oklch(98.6% 0.006 95)` | Raised surfaces: cards, sheets |
| `--pt-paper-3` | `oklch(92.4% 0.016 92)` | Sunken: wells, table heads (prototype sand) |
| `--pt-ink` / `-2` | `oklch(24% 0.022 155)` / `36%` | Text — green-black, never `#000` |
| `--pt-muted` | `oklch(48% 0.018 152)` | Captions (5.8:1 on paper) |
| `--pt-green` | `oklch(42% 0.085 154)` | Brand: primary actions, links, wordmark (prototype `#315d40`) |
| `--pt-green-deep` | `oklch(29% 0.045 160)` | Dark band: testnet banner |
| `--pt-lime` | `oklch(91% 0.14 119)` | The one accent — highlighter marks, current step, "Siap didanai" (prototype `#d8ef81`) |
| `--pt-rust` | `oklch(52% 0.12 42)` | Attention: refunds, under-delivery (prototype `#b96747`) |
| `--pt-focus` | `oklch(50% 0.15 150)` | `:focus-visible` ring, instant (4.96:1) |

Every neutral is tinted toward the green anchor; nothing is pure black, white or grey. Status is never colour alone — every badge carries a Phosphor icon and a word. Contrast was computed for every text/background pair (body ≥ 5.2:1).

### Type

- **Newsreader**, roman, 400–600 — page titles and section heads only. No italic headers anywhere (Hallmark gate 38a).
- **IBM Plex Sans** — everything a user reads or taps: labels, buttons, body, data.
- **IBM Plex Mono** — one role: ledger figures (amounts, lot ids, hashes) with `tabular-nums`, and the footer colophon.
- Major-third scale on a 16 px base; display `clamp(2.4rem, …, 4.4rem)` on the landing only. App screens use fixed rem sizes (impeccable Operate mode).

### Space, shape, motion

4-pt spacing scale (`--pt-space-*`), 6 px radius (ledger corners, not pills), one whisper shadow, named z-levels. Motion: three easings, three durations; one orchestrated reveal on the landing hero, banner retract on scroll, press-translate on buttons. `prefers-reduced-motion` collapses everything to opacity.

## 3. Rationale

- **Paper, ink and a green stamp.** The people who must trust this are farmers and co-op officers who already keep paper ledgers. The surfaces read like a well-kept book; the lime is a highlighter, used for "this needs you" moments only.
- **Narrative Workflow on the landing.** The product *is* a five-step sequence (register → field visit → co-op review → fund → weigh-in), so the page is that sequence, each step tagged with the on-chain status it produces. No invented metrics: the stat strip reads `get_stats` live and shows "—" until the contract has data; the settlement table is the contract's rule worked through with the reference numbers and labelled as an example.
- **Honesty in the chrome.** The N12 banner says "testnet · pUSDC is test money" on every page; the Intents tab says a quote is all it is; fixture mode stamps "Contoh" on every sample.
- **Phone first.** 44 px+ targets, bottom navigation with labels, bottom-sheet dialogs, camera-first evidence capture. Verified at 320 / 375 / 414 / 768 px with device-emulated screenshots.
- **No crypto words for farmers.** "Akun", "Tanda tangan", "Lihat bukti", "biaya penyimpanan data". Amounts are pUSDC with "≈ Rp" at a fixed **demo rate**, always labelled.

## 4. Screen map

| Route | Who | What |
| --- | --- | --- |
| `/` | everyone | Hero, live chain stats, five stages, worked settlement, audiences, notes |
| `/market` | buyers | Harvest lots (status/crop/region filters) · farm inputs (API) |
| `/lot/[id]` | everyone — the pay link | Stepper, trust panel (3 signed layers, photos, hashes, AI badge), funding/escrow/claims rail, money trail, ownership history, share; JSON-LD + OG image |
| `/checkout/[id]` | buyers | pUSDC steps (sign in → balance/registration → `ft_transfer_call`) · NEAR Intents dry quote |
| `/receipt/[txHash]` | anyone | Printable receipt from RPC + NEP-297 events |
| `/onboarding` | new users | Connect → role (Petani / Pembeli / Verifikator / Toko tani) → profile → optional NEP-413 sign-in |
| `/farmer` · `/farmer/new` | farmers | Claimable payouts, lots, inbox, plots · 3-step registration wizard |
| `/verify` | field agents, co-ops, warehouses | Role-adaptive queues, camera-first task sheets, AI check, silent attestations, weigh-in preview |
| `/portfolio` | buyers | Held NFTs, claimable refunds, NFT transfer, CSV |
| `/supplier` | farm shops | Listings CRUD, orders |
| `/exports` | bookkeepers | Ledger table + CSV |
| `/admin` | contract owner | Roles, fee, treasury, pause |
| `/faucet` | testers | 1,000 test pUSDC in one transaction |
| `/activity` | everyone | Public feed derived from chain state |

## 5. Component vocabulary

`components/lot` (LotCard, StatusBadge, StatusStepper, TransferNftButton, ShareButton) · `components/trust` (TrustPanel, AiCheckBadge) · `components/money` (Money/Rupiah/MoneyBlock, MoneyTimeline, EscrowPanel, ClaimButton, AmountInput, TxStatusLine) · `components/evidence` (EvidenceUploader) · `components/wallet` (ConnectSheet, AccountMenu, ConnectGate) · `components/layout` (AppShell, SiteHeader N12, BottomBar, SiteFooter Ft4, PageHeader) · `components/common` (EmptyState, NotDeployedState, ApiOfflineBanner, SampleBanner, RoleGate, ResponsiveDialog, Inbox).

Every interactive control has default, hover, focus-visible, active, disabled, loading (spinner + disabled), error and success (TxStatusLine / toast with "Lihat bukti").
