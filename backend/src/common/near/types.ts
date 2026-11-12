// Mirrors docs/INTERFACES.md §3 (harvest-lot contract JSON shapes).

export type LotStatus =
  | 'Registered'
  | 'FieldVerified'
  | 'CoopVerified'
  | 'Listed'
  | 'Funded'
  | 'Settled'
  | 'Refunded'
  | 'Cancelled';

export type Role = 'Admin' | 'FieldAgent' | 'Coop' | 'Warehouse';

export interface Attestation {
  kind: 'FieldVisit' | 'CoopReview' | 'WarehouseWeighIn' | 'CropFailure';
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
  status: LotStatus;
  attestations: Attestation[];
  sold_kg: number;
  remaining_kg: number;
  share_count: number;
  escrow: string;
  funded_at_ms: number | null;
  actual_kg: number | null;
  grade: string | null;
  settled_at_ms: number | null;
  /** Fee rate frozen at the first sale (0 before). */
  fee_bps: number;
  claims: Claims;
  claim_lock: boolean;
  created_at_ms: number;
  funding_total: string;
  /** Refund pool snapshotted at settlement ("0" before); shares claim floor(pool × kg / sold_kg). */
  holder_pool: string;
}

/** Mirror of the contract `get_share` view: one kg-denominated share NFT. */
export interface ShareView {
  share_id: string;
  lot_id: string;
  kg: number;
  owner: string;
  claimed: boolean;
  /** U128 refund entitlement after settle/refund; "0" before. */
  entitlement: string;
}

export interface ContractConfig {
  owner_id: string;
  usdc_contract: string;
  treasury: string;
  fee_bps: number;
  paused: boolean;
  total_lots: number;
}

export interface ContractStats {
  total_lots: number;
  verified_lots: number;
  funded_lots: number;
  settled_lots: number;
  settled_volume: string;
  farmer_paid: string;
}

/** Subset of the RPC `EXPERIMENTAL_tx_status` response we rely on. */
export interface TxReceiptOutcome {
  id: string;
  block_hash: string;
  outcome: {
    logs: string[];
    executor_id: string;
    receipt_ids?: string[];
    status: unknown;
  };
}

export interface TxStatusResult {
  final_execution_status?: string;
  status: unknown;
  transaction: {
    hash: string;
    signer_id: string;
    receiver_id: string;
    actions: unknown[];
  };
  transaction_outcome?: TxReceiptOutcome;
  receipts_outcome: TxReceiptOutcome[];
}
