/**
 * Design-review fixtures (NEXT_PUBLIC_DEMO_FIXTURES=1). Three sample lots that
 * walk the lifecycle. Every surface that renders them shows a "Contoh" label;
 * fixtures are never mixed with chain data — the flag switches the source wholesale.
 */
import type { Attestation, Config, LotView, Stats } from "@/lib/near/types";

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
  note: "Tanaman fase vegetatif, lahan sesuai titik GPS.",
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
  note: "Catatan penyuluh dan foto lahan cocok dengan data anggota.",
  actual_kg: null,
  grade: null,
  gps_hash: null,
});

const base = {
  plot_hash: hash("5d"),
  gps_hash: hash("9f"),
  claim_lock: false,
  claims: { farmer: "0", holder: "0", treasury: "0" },
  actual_kg: null,
  grade: null,
  settled_at_ms: null,
  funder: null,
  funded_at_ms: null,
};

export const FIXTURE_LOTS: LotView[] = [
  {
    ...base,
    lot_id: "lot-1",
    farmer_id: "contoh-petani.testnet",
    crop: "Padi",
    variety: "IR64",
    region: "Karawang, Jawa Barat",
    projected_kg: 1000,
    harvest_month: "2027-02",
    area_m2: 2500,
    price_per_kg: "450000",
    status: "Listed",
    attestations: [field("contoh-penyuluh.testnet", t0 + 2 * day), coop("contoh-koperasi.testnet", t0 + 4 * day)],
    escrow: "0",
    created_at_ms: t0,
    holder: "contoh-petani.testnet",
    funding_total: "450000000",
  },
  {
    ...base,
    lot_id: "lot-2",
    farmer_id: "contoh-petani-2.testnet",
    crop: "Kopi Robusta",
    variety: "BP 308",
    region: "Tanggamus, Lampung",
    projected_kg: 600,
    harvest_month: "2027-05",
    area_m2: 8000,
    price_per_kg: "2100000",
    status: "Funded",
    attestations: [field("contoh-penyuluh.testnet", t0 + 3 * day), coop("contoh-koperasi.testnet", t0 + 6 * day)],
    escrow: "1260000000",
    funder: "contoh-pembeli.testnet",
    funded_at_ms: t0 + 9 * day,
    created_at_ms: t0 + day,
    holder: "contoh-pembeli.testnet",
    funding_total: "1260000000",
  },
  {
    ...base,
    lot_id: "lot-3",
    farmer_id: "contoh-petani.testnet",
    crop: "Padi",
    variety: "Ciherang",
    region: "Klaten, Jawa Tengah",
    projected_kg: 1000,
    harvest_month: "2026-11",
    area_m2: 2200,
    price_per_kg: "450000",
    status: "Settled",
    attestations: [
      field("contoh-penyuluh.testnet", t0 - 40 * day),
      coop("contoh-koperasi.testnet", t0 - 38 * day),
      {
        kind: "WarehouseWeighIn",
        signer: "contoh-gudang.testnet",
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
    funder: "contoh-pembeli.testnet",
    funded_at_ms: t0 - 30 * day,
    actual_kg: 900,
    grade: "A",
    settled_at_ms: t0 + 12 * day,
    claims: { farmer: "396900000", holder: "45000000", treasury: "8100000" },
    created_at_ms: t0 - 45 * day,
    holder: "contoh-pembeli.testnet",
    funding_total: "450000000",
  },
];

export const FIXTURE_CONFIG: Config = {
  owner_id: "contoh-pratala.testnet",
  usdc_contract: "pusdc.pratala.testnet",
  treasury: "contoh-pratala.testnet",
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
  forHolder: async (id: string) => FIXTURE_LOTS.filter((l) => l.holder === id),
  config: async () => FIXTURE_CONFIG,
  stats: async () => FIXTURE_STATS,
};
