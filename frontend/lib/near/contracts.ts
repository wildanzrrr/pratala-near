/**
 * Typed wrappers for every harvest-lot and pUSDC method in docs/INTERFACES.md §3–4.
 *
 * Views go straight to JSON-RPC (no wallet). Change methods are returned as
 * transaction descriptors `{ receiverId, actions }` in NEAR Connect's
 * ConnectorAction format; mutation hooks hand them to the wallet. Method names,
 * deposits and gas live here and nowhere else.
 */
import { JsonRpcProvider } from "near-api-js";

import { env } from "@/lib/env";
import { classifyViewError } from "@/lib/near/errors";

import type { ConnectorAction } from "@hot-labs/near-connect";
import type {
  Attestation,
  Claims,
  Config,
  LotView,
  NftToken,
  Role,
  ShareView,
  Stats,
  Status,
  StorageBalance,
  StorageBounds,
  StoredRole,
} from "@/lib/near/types";

/* ── constants ─────────────────────────────────────────────── */

export const TGAS = 1_000_000_000_000n;
export const gas = (tgas: number) => (BigInt(tgas) * TGAS).toString();

export const ONE_YOCTO = "1";
/** register_lot storage deposit — 0.6 NEAR (lot + share-mint reserve), excess refunded. */
export const REGISTER_LOT_DEPOSIT = "600000000000000000000000";
/** Fallback for pUSDC storage_balance_bounds.min (≈ 0.00125 NEAR). */
export const STORAGE_DEPOSIT_FALLBACK = "1250000000000000000000";
/** Default faucet grant: 1,000 pUSDC. Contract cap is 10,000 pUSDC. */
export const FAUCET_AMOUNT = "1000000000";
export const FAUCET_MAX = "10000000000";
/** Function-call key allowance for the lots contract: 0.25 NEAR. */
export const FC_KEY_ALLOWANCE = "250000000000000000000000";

/**
 * Zero-deposit lots-contract methods a function-call key may sign
 * (INTERFACES §3 "Function-call-key friendly"). Never add a payable method.
 */
export const FC_METHODS = [
  "attest_field",
  "attest_coop",
  "weigh_in",
  "declare_failure",
  "list_lot",
  "update_price",
  "delist_lot",
  "close_funding",
  "cancel_lot",
  "claim_payout",
  "claim_refund",
  "claim_fee",
] as const;

export const LOTS = () => env.lotsContractId;
export const PUSDC = () => env.pusdcContractId;

/* ── RPC ───────────────────────────────────────────────────── */

let provider: JsonRpcProvider | null = null;

export function rpc(): JsonRpcProvider {
  provider ??= new JsonRpcProvider({ url: env.rpcUrl });
  return provider;
}

async function view<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  try {
    const result = await rpc().callFunction<never>({ contractId, method, args });
    return result as unknown as T;
  } catch (error) {
    throw classifyViewError(error, contractId);
  }
}

/* ── harvest-lot views ─────────────────────────────────────── */

export const getLot = (lotId: string) => view<LotView | null>(LOTS(), "get_lot", { lot_id: lotId });

/** List views return at most 100 items (INTERFACES §3). */
export const getLots = (fromIndex = 0, limit = 100) =>
  view<LotView[]>(LOTS(), "get_lots", { from_index: fromIndex, limit });

export const getLotsByStatus = (status: Status, fromIndex = 0, limit = 100) =>
  view<LotView[]>(LOTS(), "get_lots_by_status", { status, from_index: fromIndex, limit });

export const getLotsByFarmer = (accountId: string) =>
  view<LotView[]>(LOTS(), "get_lots_by_farmer", { account_id: accountId });

export const getShare = (shareId: string) => view<ShareView | null>(LOTS(), "get_share", { share_id: shareId });

export const getShares = (lotId: string) => view<ShareView[]>(LOTS(), "get_shares", { lot_id: lotId });

/** A holder's share NFTs: NEP-181 tokens with ids like "lot-N:M" (≤ 100, INTERFACES §3). */
export async function getSharesForOwner(accountId: string): Promise<ShareView[]> {
  const tokens = await view<NftToken[]>(LOTS(), "nft_tokens_for_owner", {
    account_id: accountId,
  });
  const shareIds = tokens.map((t) => t.token_id).filter((id) => /^lot-\d{1,12}:\d{1,10}$/.test(id));
  const shares = await Promise.all(shareIds.map((id) => getShare(id)));
  return shares.filter((s): s is ShareView => s !== null);
}

export const getAttestations = (lotId: string) => view<Attestation[]>(LOTS(), "get_attestations", { lot_id: lotId });

export const getClaims = (lotId: string) => view<Claims>(LOTS(), "get_claims", { lot_id: lotId });

export const quoteFunding = (lotId: string) => view<string>(LOTS(), "quote_funding", { lot_id: lotId });

export const quotePurchase = (lotId: string, kg: number) =>
  view<string>(LOTS(), "quote_purchase", { lot_id: lotId, kg });

export const getRoles = (accountId: string) => view<Role[]>(LOTS(), "get_roles", { account_id: accountId });

export const listRole = (role: StoredRole) => view<string[]>(LOTS(), "list_role", { role });

export const getConfig = () => view<Config>(LOTS(), "get_config");

export const getStats = () => view<Stats>(LOTS(), "get_stats");

export const nftToken = (tokenId: string) => view<NftToken | null>(LOTS(), "nft_token", { token_id: tokenId });

/* ── pUSDC views ───────────────────────────────────────────── */

export const ftBalanceOf = (accountId: string) =>
  view<string>(PUSDC(), "ft_balance_of", { account_id: accountId });

export const storageBalanceOf = (accountId: string) =>
  view<StorageBalance | null>(PUSDC(), "storage_balance_of", { account_id: accountId });

export const storageBalanceBounds = () => view<StorageBounds>(PUSDC(), "storage_balance_bounds");

/* ── transaction descriptors ───────────────────────────────── */

export interface TxRequest {
  receiverId: string;
  actions: ConnectorAction[];
  /** true when a function-call key can sign it locally (no wallet popup). */
  silent: boolean;
}

function call(methodName: string, args: object, tgas: number, deposit = "0"): ConnectorAction {
  return { type: "FunctionCall", params: { methodName, args, gas: gas(tgas), deposit } };
}

function lotsTx(methodName: (typeof FC_METHODS)[number] | string, args: object, tgas = 30, deposit = "0"): TxRequest {
  const silent = deposit === "0" && (FC_METHODS as readonly string[]).includes(methodName);
  return { receiverId: LOTS(), actions: [call(methodName, args, tgas, deposit)], silent };
}

export interface RegisterLotArgs {
  crop: string;
  variety?: string | null;
  region: string;
  projected_kg: number;
  harvest_month: string;
  plot_hash: string;
  gps_hash: string;
  area_m2?: number | null;
  media_uri?: string | null;
  /** NEP-177 reference (e.g. API metadata.json URL) */
  reference?: string | null;
}

export const tx = {
  registerLot: (args: RegisterLotArgs) => lotsTx("register_lot", args, 50, REGISTER_LOT_DEPOSIT),

  attestField: (args: {
    lot_id: string;
    evidence_hash: string;
    evidence_uri?: string | null;
    gps_hash: string;
    ai_check_hash?: string | null;
    note?: string | null;
  }) => lotsTx("attest_field", args),

  attestCoop: (args: { lot_id: string; evidence_hash: string; evidence_uri?: string | null; note?: string | null }) =>
    lotsTx("attest_coop", args),

  listLot: (lotId: string, pricePerKg: string) => lotsTx("list_lot", { lot_id: lotId, price_per_kg: pricePerKg }),
  updatePrice: (lotId: string, pricePerKg: string) =>
    lotsTx("update_price", { lot_id: lotId, price_per_kg: pricePerKg }),
  delistLot: (lotId: string) => lotsTx("delist_lot", { lot_id: lotId }),
  cancelLot: (lotId: string) => lotsTx("cancel_lot", { lot_id: lotId }),

  weighIn: (args: {
    lot_id: string;
    actual_kg: number;
    grade: string;
    evidence_hash: string;
    evidence_uri?: string | null;
    ai_check_hash?: string | null;
  }) => lotsTx("weigh_in", args),

  declareFailure: (args: { lot_id: string; reason: string; evidence_hash: string }) =>
    lotsTx("declare_failure", args),

  claimPayout: (lotId: string) => lotsTx("claim_payout", { lot_id: lotId }, 60),
  claimRefund: (shareId: string) => lotsTx("claim_refund", { share_id: shareId }, 60),
  claimFee: (lotId: string) => lotsTx("claim_fee", { lot_id: lotId }, 60),

  /** Farmer/owner ends a partially-funded listing early: Listed → Funded with the sold kg. */
  closeFunding: (lotId: string) => lotsTx("close_funding", { lot_id: lotId }),

  nftTransfer: (receiverId: string, tokenId: string, memo?: string) =>
    lotsTx("nft_transfer", { receiver_id: receiverId, token_id: tokenId, memo: memo ?? null }, 30, ONE_YOCTO),

  addRole: (role: StoredRole, accountId: string) => lotsTx("add_role", { role, account_id: accountId }),
  removeRole: (role: StoredRole, accountId: string) => lotsTx("remove_role", { role, account_id: accountId }),
  setFeeBps: (feeBps: number) => lotsTx("set_fee_bps", { fee_bps: feeBps }),
  setTreasury: (accountId: string) => lotsTx("set_treasury", { account_id: accountId }),
  setPaused: (paused: boolean) => lotsTx("set_paused", { paused }),

  /** Buying kg = ft_transfer_call on pUSDC (1 yocto, 100 Tgas); each purchase mints a share NFT. */
  fundLot: (lotId: string, kg: number, amount: string): TxRequest => ({
    receiverId: PUSDC(),
    silent: false,
    actions: [
      call(
        "ft_transfer_call",
        { receiver_id: LOTS(), amount, msg: JSON.stringify({ action: "fund", lot_id: lotId, kg }) },
        100,
        ONE_YOCTO,
      ),
    ],
  }),

  /** Plain pUSDC transfer — supplier orders carry the order memo. */
  ftTransfer: (receiverId: string, amount: string, memo?: string): TxRequest => ({
    receiverId: PUSDC(),
    silent: false,
    actions: [call("ft_transfer", { receiver_id: receiverId, amount, memo: memo ?? null }, 30, ONE_YOCTO)],
  }),

  storageDeposit: (accountId: string, deposit: string): TxRequest => ({
    receiverId: PUSDC(),
    silent: false,
    actions: [call("storage_deposit", { account_id: accountId, registration_only: true }, 30, deposit)],
  }),

  /** Faucet UI = one transaction, two actions: storage_deposit (if unregistered) + faucet. */
  faucet: (opts: { accountId: string; registered: boolean; storageDeposit: string; amount?: string }): TxRequest => ({
    receiverId: PUSDC(),
    silent: false,
    actions: [
      ...(opts.registered
        ? []
        : [call("storage_deposit", { account_id: opts.accountId, registration_only: true }, 30, opts.storageDeposit)]),
      call("faucet", { amount: opts.amount ?? FAUCET_AMOUNT }, 30),
    ],
  }),
};

/** Lot certificate NFTs move only after funding closes and while no claim is in flight. */
export const TRANSFERABLE: readonly Status[] = ["Funded", "Settled", "Refunded"];
export const canTransfer = (lot: Pick<LotView, "status" | "claim_lock">) => TRANSFERABLE.includes(lot.status) && !lot.claim_lock;

/** Share NFTs carry escrow-backed claims from mint; they move unless a payout is in flight. */
export const canTransferShare = (lot: Pick<LotView, "claim_lock">) => !lot.claim_lock;

/* ── outcome helpers ───────────────────────────────────────── */

interface OutcomeLike {
  transaction?: { hash?: string; signer_id?: string };
  transaction_outcome?: { id?: string };
  status?: unknown;
  receipts_outcome?: Array<{ outcome?: { logs?: string[] } }>;
}

export function txHashOf(outcome: unknown): string | null {
  const o = outcome as OutcomeLike | null;
  return o?.transaction?.hash ?? o?.transaction_outcome?.id ?? null;
}

/** Decode the final SuccessValue (base64 JSON) of a transaction, e.g. register_lot's lot_id. */
export function lastResultOf<T>(outcome: unknown): T | null {
  const status = (outcome as OutcomeLike | null)?.status as { SuccessValue?: string } | undefined;
  if (!status?.SuccessValue) return null;
  try {
    const text = typeof atob === "function" ? atob(status.SuccessValue) : Buffer.from(status.SuccessValue, "base64").toString();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export interface ChainEvent {
  standard: string;
  version: string;
  event: string;
  data: Array<Record<string, unknown>>;
}

/** NEP-297 events (`EVENT_JSON:` logs) across every receipt of an outcome. */
export function eventsOf(outcome: unknown): ChainEvent[] {
  const receipts = (outcome as OutcomeLike | null)?.receipts_outcome ?? [];
  const events: ChainEvent[] = [];
  for (const receipt of receipts) {
    for (const log of receipt.outcome?.logs ?? []) {
      if (!log.startsWith("EVENT_JSON:")) continue;
      try {
        events.push(JSON.parse(log.slice("EVENT_JSON:".length)) as ChainEvent);
      } catch {
        /* ignore malformed log */
      }
    }
  }
  return events;
}
