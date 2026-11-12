/**
 * Design-review fixtures (NEXT_PUBLIC_DEMO_FIXTURES=1). Three sample lots that
 * walk the lifecycle. Every surface that renders them shows a "Sample" label;
 * fixtures are never mixed with chain data — the flag switches the source wholesale.
 */
import type { Attestation, Config, LotView, ShareView, Stats } from "@/lib/near/types";

const day = 86_400_000;
const t0 = Date.UTC(2026, 9, 20, 2, 0, 0);
const hash = (seed: string) => seed.repeat(64).slice(0, 64);

const field = (signer: string, at: number): Attestation => ({
  kind: "FieldVisit",
  signer,
  timestamp_ms: at,
  evidence_hash: hash("a1"),
  evidence_uri: null,
  ai_check_hash: hash("c3"),
  note: "Crop in the vegetative stage; plot matches the GPS point.",
  actual_kg: null,
  grade: null,
  gps_hash: hash("9f"),
});

const coop = (signer: string, at: number): Attestation => ({
  kind: "CoopReview",
  signer,
  timestamp_ms: at,
  evidence_hash: hash("b2"),
  evidence_uri: null,
  ai_check_hash: null,
  note: "Field agent's notes and plot photos match the member record.",
  actual_kg: null,
  grade: null,
  gps_hash: null,
});

const base = {
  plot_hash: hash("5d"),
  gps_hash: hash("9f"),
  claim_lock: false,
  fee_bps: 0,
  claims: { farmer: "0", holder: "0", treasury: "0" },
  actual_kg: null,
  grade: null,
  settled_at_ms: null,
  funded_at_ms: null,
  sold_kg: 0,
  share_count: 0,
  holder_pool: "0",
};

export const FIXTURE_LOTS: LotView[] = [
  {
    ...base,
    lot_id: "lot-1",
    farmer_id: "sample-farmer.testnet",
    crop: "Rice",
    variety: "IR64",
    region: "Karawang, West Java",
    projected_kg: 1000,
    harvest_month: "2027-02",
    area_m2: 2500,
    price_per_kg: "450000",
    status: "Listed",
    attestations: [field("sample-field-agent.testnet", t0 + 2 * day), coop("sample-coop.testnet", t0 + 4 * day)],
    escrow: "0",
    created_at_ms: t0,
    funding_total: "450000000",
    remaining_kg: 1000,
  },
  {
    ...base,
    lot_id: "lot-2",
    farmer_id: "sample-farmer-2.testnet",
    crop: "Robusta coffee",
    variety: "BP 308",
    region: "Tanggamus, Lampung",
    projected_kg: 600,
    harvest_month: "2027-05",
    area_m2: 8000,
    price_per_kg: "2100000",
    status: "Funded",
    fee_bps: 200,
    attestations: [field("sample-field-agent.testnet", t0 + 3 * day), coop("sample-coop.testnet", t0 + 6 * day)],
    escrow: "1008000000",
    funded_at_ms: t0 + 9 * day,
    created_at_ms: t0 + day,
    funding_total: "1260000000",
    sold_kg: 480,
    remaining_kg: 120,
    share_count: 2,
  },
  {
    ...base,
    lot_id: "lot-3",
    farmer_id: "sample-farmer.testnet",
    crop: "Rice",
    variety: "Ciherang",
    region: "Klaten, Central Java",
    projected_kg: 1000,
    harvest_month: "2026-11",
    area_m2: 2200,
    price_per_kg: "450000",
    status: "Settled",
    fee_bps: 200,
    attestations: [
      field("sample-field-agent.testnet", t0 - 40 * day),
      coop("sample-coop.testnet", t0 - 38 * day),
      {
        kind: "WarehouseWeighIn",
        signer: "sample-warehouse.testnet",
        timestamp_ms: t0 + 12 * day,
        evidence_hash: hash("d4"),
        evidence_uri: null,
        ai_check_hash: hash("e5"),
        note: null,
        actual_kg: 900,
        grade: "A",
        gps_hash: null,
      },
    ],
    escrow: "0",
    funded_at_ms: t0 - 30 * day,
    actual_kg: 900,
    grade: "A",
    settled_at_ms: t0 + 12 * day,
    claims: { farmer: "396900000", holder: "45000000", treasury: "8100000" },
    created_at_ms: t0 - 45 * day,
    funding_total: "450000000",
    sold_kg: 1000,
    remaining_kg: 0,
    share_count: 2,
    holder_pool: "45000000",
  },
];

const FIXTURE_SHARES: ShareView[] = [
  // lot-2: two buyers split the sold 480 kg; funding still open.
  { share_id: "lot-2:1", lot_id: "lot-2", kg: 300, owner: "sample-buyer.testnet", claimed: false, entitlement: "0" },
  { share_id: "lot-2:2", lot_id: "lot-2", kg: 180, owner: "sample-investor.testnet", claimed: false, entitlement: "0" },
  // lot-3: sold out and settled; the 45.00 pool splits 31.50 / 13.50.
  { share_id: "lot-3:1", lot_id: "lot-3", kg: 700, owner: "sample-buyer.testnet", claimed: false, entitlement: "31500000" },
  { share_id: "lot-3:2", lot_id: "lot-3", kg: 300, owner: "sample-investor.testnet", claimed: false, entitlement: "13500000" },
];

export const FIXTURE_CONFIG: Config = {
  owner_id: "sample-pratala.testnet",
  usdc_contract: "pusdc.pratala.testnet",
  treasury: "sample-pratala.testnet",
  fee_bps: 200,
  paused: false,
  total_lots: FIXTURE_LOTS.length,
};

export const FIXTURE_STATS: Stats = {
  total_lots: 3,
  verified_lots: 3,
  funded_lots: 2,
  settled_lots: 1,
  settled_volume: "405000000",
  farmer_paid: "0",
};

export const fixtures = {
  lot: async (id: string) => FIXTURE_LOTS.find((l) => l.lot_id === id) ?? null,
  lots: async () => FIXTURE_LOTS,
  byStatus: async (status: string) => FIXTURE_LOTS.filter((l) => l.status === status),
  byFarmer: async (id: string) => FIXTURE_LOTS.filter((l) => l.farmer_id === id),
  sharesForOwner: async (id: string) => FIXTURE_SHARES.filter((s) => s.owner === id),
  config: async () => FIXTURE_CONFIG,
  stats: async () => FIXTURE_STATS,
};
