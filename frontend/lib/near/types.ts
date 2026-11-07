/**
 * Contract + API shapes, copied from docs/INTERFACES.md §3–5.
 * U128 amounts are strings of base units; u64 counts and *_ms are numbers.
 */

export const STATUSES = [
  "Registered",
  "FieldVerified",
  "CoopVerified",
  "Listed",
  "Funded",
  "Settled",
  "Refunded",
  "Cancelled",
] as const;
export type Status = (typeof STATUSES)[number];

export const ROLES = ["Admin", "FieldAgent", "Coop", "Warehouse"] as const;
export type Role = (typeof ROLES)[number];
export type StoredRole = Exclude<Role, "Admin">;

export type AttestationKind = "FieldVisit" | "CoopReview" | "WarehouseWeighIn" | "CropFailure";
export type ClaimKind = "Farmer" | "Holder" | "Treasury";

export interface Attestation {
  kind: AttestationKind;
  signer: string;
  timestamp_ms: number;
  evidence_hash: string;
  evidence_uri: string | null;
  ai_check_hash: string | null;
  note: string | null;
  actual_kg: number | null;
  grade: string | null;
  gps_hash: string | null;
}

export interface Claims {
  farmer: string;
  holder: string;
  treasury: string;
}

export interface LotView {
  lot_id: string;
  farmer_id: string;
  crop: string;
  variety: string | null;
  region: string;
  projected_kg: number;
  harvest_month: string;
  plot_hash: string;
  gps_hash: string;
  area_m2: number | null;
  price_per_kg: string;
  status: Status;
  attestations: Attestation[];
  escrow: string;
  funder: string | null;
  funded_at_ms: number | null;
  actual_kg: number | null;
  grade: string | null;
  settled_at_ms: number | null;
  claims: Claims;
  claim_lock: boolean;
  created_at_ms: number;
  holder: string;
  funding_total: string;
}

export interface Config {
  owner_id: string;
  usdc_contract: string;
  treasury: string;
  fee_bps: number;
  paused: boolean;
  total_lots: number;
}

export interface Stats {
  total_lots: number;
  verified_lots: number;
  funded_lots: number;
  settled_lots: number;
  settled_volume: string;
  farmer_paid: string;
}

export interface StorageBalance {
  total: string;
  available: string;
}

export interface StorageBounds {
  min: string;
  max: string | null;
}

export interface NftToken {
  token_id: string;
  owner_id: string;
  metadata?: Record<string, unknown> | null;
}

/* ── backend API (§5) ─────────────────────────────────────────── */

export type Intent = "farmer" | "buyer" | "verifier" | "supplier";

export interface Profile {
  accountId?: string;
  displayName: string;
  region: string;
  locale: "id" | "en";
  phone?: string | null;
  intent: Intent;
}

export interface Me {
  accountId: string;
  roles: Role[];
  profile: Profile | null;
}

export interface AuthChallenge {
  nonce: string;
  message: string;
  recipient: string;
  expiresAt: string;
}

export interface Plot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  areaM2: number;
  region: string;
  evidenceIds: string[];
  plotHash: string;
  gpsHash: string;
}

export type EvidenceKind = "PLOT" | "FIELD_VISIT" | "COOP_REVIEW" | "WEIGH_IN" | "CROP_FAILURE";

export interface Evidence {
  id: string;
  sha256: string;
  uri: string;
  mime: string;
  lat: number | null;
  lng: number | null;
  capturedAt: string | null;
  kind: EvidenceKind;
}

export type AiCheckKind = "FIELD_VISIT" | "COOP_REVIEW" | "WEIGH_IN" | "PLOT";

export interface AiCheck {
  id: string;
  evidenceId: string;
  model: string;
  provider: "near-ai-cloud";
  chatId: string | null;
  verdict: "pass" | "review" | "fail";
  confidence: number;
  findings: string[];
  extracted: { crop?: string; stage?: string; kg?: number; grade?: string };
  summaryId: string;
  summaryEn: string;
  responseHash: string;
  signatureAvailable: boolean;
  verifyUrl: string;
  createdAt: string;
}

export interface LotEvent {
  id: string;
  lotId: string | null;
  event: string;
  data: Record<string, unknown>;
  txHash: string;
  signerId: string;
  blockTimestamp: string;
}

export type LotDetailApi = LotView & { evidence: Evidence[]; aiChecks: AiCheck[] };

export type PaymentType = "FUNDING" | "PAYOUT" | "REFUND" | "FEE" | "INPUT_PURCHASE";
export type PaymentStatus = "PENDING" | "PAID" | "REFUNDED" | "FAILED";

export interface Payment {
  id: string;
  lotId: string | null;
  orderId: string | null;
  type: PaymentType;
  fromAccount: string;
  toAccount: string;
  amount: string;
  status: PaymentStatus;
  txHash: string | null;
  explorerUrl: string | null;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  title?: string;
  body?: string;
  kind?: string;
  lotId?: string | null;
  read?: boolean;
  readAt?: string | null;
  createdAt: string;
  [key: string]: unknown;
}

export type ListingCategory = "SEED" | "FERTILIZER" | "SOIL" | "OTHER";

export interface InputListing {
  id: string;
  sellerId: string;
  title: string;
  category: ListingCategory;
  description: string;
  priceUsdc: string;
  unit: string;
  stock: number;
  region: string;
  createdAt?: string;
}

export type ListingInput = Omit<InputListing, "id" | "sellerId" | "createdAt">;

export interface Order {
  id: string;
  memo: string;
  amount: string;
  sellerId: string;
  status: string;
  listingId?: string;
  qty?: number;
  txHash?: string | null;
  createdAt?: string;
}

export interface ApiHealth {
  ok: boolean;
  db: boolean | string;
  chain: { rpc: string; lotsContract: string; pusdcContract: string };
  ai: { configured: boolean; model: string | null };
}

export interface ApiStats extends Stats {
  farmers: number;
  verifiers: number;
}

/* ── NEAR Intents 1Click passthrough (prototype server.mjs shape) ── */

export interface IntentsToken {
  assetId: string;
  blockchain: string;
  symbol: string;
  decimals: number;
  price?: number;
  contractAddress?: string;
}

export interface IntentsQuoteRequest {
  originAsset: string;
  destinationAsset: string;
  amount: string;
  recipient: string;
  refundTo: string;
  slippageTolerance?: number;
  dry?: boolean;
}

export interface IntentsQuoteResponse {
  quote: {
    quote?: {
      amountIn?: string;
      amountInFormatted?: string;
      amountOut?: string;
      amountOutFormatted?: string;
      amountInUsd?: string;
      amountOutUsd?: string;
      timeEstimate?: number;
      depositAddress?: string;
      deadline?: string;
    };
    [key: string]: unknown;
  };
  request?: Record<string, unknown>;
  feeNotice?: string;
  partnerKeyConfigured?: boolean;
}
