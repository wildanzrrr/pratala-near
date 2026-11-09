/**
 * Backend client (docs/INTERFACES.md §5). Cookie session, JSON in/out.
 * Network failures and 5xx become ApiUnavailableError so pages can show the
 * offline banner and keep rendering chain data. 4xx become ApiError.
 */
import { env } from "@/lib/env";

import type {
  AiCheck,
  AiCheckKind,
  ApiHealth,
  ApiStats,
  AppNotification,
  AuthChallenge,
  Evidence,
  EvidenceKind,
  InputListing,
  IntentsQuoteRequest,
  IntentsQuoteResponse,
  IntentsToken,
  ListingInput,
  LotDetailApi,
  LotEvent,
  LotView,
  Me,
  Order,
  Payment,
  Plot,
  Profile,
} from "@/lib/near/types";

export class ApiUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Pratala API is unavailable", { cause });
    this.name = "ApiUnavailableError";
  }
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const isApiUnavailable = (e: unknown): e is ApiUnavailableError => e instanceof ApiUnavailableError;
export const isUnauthorized = (e: unknown) => e instanceof ApiError && (e.status === 401 || e.status === 403);

type Query = Record<string, string | number | boolean | null | undefined>;

function url(path: string, query?: Query): string {
  const u = new URL(env.apiUrl + path);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  return u.toString();
}

export async function apiFetch<T>(path: string, init: RequestInit & { query?: Query } = {}): Promise<T> {
  const { query, headers, ...rest } = init;
  const isForm = typeof FormData !== "undefined" && rest.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(url(path, query), {
      credentials: "include",
      ...rest,
      headers: { Accept: "application/json", ...(rest.body && !isForm ? { "Content-Type": "application/json" } : {}), ...headers },
      signal: rest.signal ?? AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError" && rest.signal?.aborted) throw error;
    throw new ApiUnavailableError(error);
  }
  if (response.status >= 500 || response.status === 0) throw new ApiUnavailableError(response.status);
  const text = await response.text();
  const body = text ? safeJson(text) : null;
  if (!response.ok) {
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const raw = record.message ?? record.error ?? response.statusText;
    const message = Array.isArray(raw) ? raw.join(", ") : String(raw);
    throw new ApiError(response.status, message);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  health: () => apiFetch<ApiHealth>("/health"),
  stats: () => apiFetch<ApiStats>("/stats"),

  /* auth (NEP-413) */
  challenge: (accountId: string) => apiFetch<AuthChallenge>("/auth/challenge", { method: "POST", body: json({ accountId }) }),
  verify: (body: { accountId: string; publicKey: string; signature: string; nonce: string }) =>
    apiFetch<{ accountId: string }>("/auth/verify", { method: "POST", body: json(body) }),
  logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),
  me: () => apiFetch<Me>("/auth/me"),

  /* auth + accounts for NEAR Auth email SSO */
  fastauthResolveAccount: (body: { token: string }) =>
    apiFetch<{ accountId: string | null; publicKey: string }>("/fastauth/resolve-account", { method: "POST", body: json(body) }),
  fastauthCreateAccount: (body: { accountId: string; publicKey: string; token: string }) =>
    apiFetch<{ accountId: string; txHash: string; seedNear: string }>("/fastauth/create-account", { method: "POST", body: json(body) }),
  fastauthSignTx: (body: { guard_id: string; verify_payload: string; sign_payload: string | number[]; algorithm?: string }) =>
    apiFetch<{ hash: string; result: { status?: { SuccessValue?: string; Failure?: unknown } } }>("/fastauth/sign-tx", { method: "POST", body: json(body) }),
  verifySso: (body: { accountId: string; publicKey: string; token: string }) =>
    apiFetch<{ accountId: string }>("/auth/verify-sso", { method: "POST", body: json(body) }),

  /* profiles */
  myProfile: () => apiFetch<Profile>("/users/me"),
  saveProfile: (profile: Profile) => apiFetch<Profile>("/users/me", { method: "PUT", body: json(profile) }),
  profile: (accountId: string) => apiFetch<Profile>(`/users/${encodeURIComponent(accountId)}`),

  /* plots + evidence + AI */
  createPlot: (body: { name: string; lat: number; lng: number; areaM2: number; region: string; evidenceIds: string[] }) =>
    apiFetch<Plot>("/plots", { method: "POST", body: json(body) }),
  myPlots: () => apiFetch<Plot[]>("/plots/mine"),
  uploadEvidence: (file: File, kind: EvidenceKind, opts: { lotId?: string; plotId?: string } = {}) => {
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    if (opts.lotId) form.set("lotId", opts.lotId);
    if (opts.plotId) form.set("plotId", opts.plotId);
    return apiFetch<Evidence>("/evidence", { method: "POST", body: form, signal: AbortSignal.timeout(60_000) });
  },
  evidenceUrl: (sha256: string) => `${env.apiUrl}/evidence/${sha256}`,
  aiCheck: (body: { evidenceId: string; kind: AiCheckKind; expectedCrop?: string; plotLat?: number; plotLng?: number }) =>
    apiFetch<AiCheck>("/ai/check", { method: "POST", body: json(body), signal: AbortSignal.timeout(90_000) }),
  getAiCheck: (id: string) => apiFetch<AiCheck>(`/ai/check/${id}`),

  /* lots mirror + history */
  lots: (query: Query = {}) => apiFetch<LotView[]>("/lots", { query }),
  lot: (lotId: string) => apiFetch<LotDetailApi>(`/lots/${encodeURIComponent(lotId)}`),
  lotHistory: (lotId: string) => apiFetch<LotEvent[]>(`/lots/${encodeURIComponent(lotId)}/history`),
  metadataUrl: (lotId: string) => `${env.apiUrl}/lots/${encodeURIComponent(lotId)}/metadata.json`,

  /* indexer hint — never blocks the UI */
  postTx: (body: { txHash: string; signerId: string; context?: { lotId?: string; orderId?: string } }) =>
    apiFetch<{ ok: boolean; events: LotEvent[] }>("/tx", { method: "POST", body: json(body) }),

  /* ledger */
  payments: (query: { account?: string; lotId?: string; from?: string; to?: string } = {}) =>
    apiFetch<Payment[]>("/payments", { query }),
  paymentsCsvUrl: (query: { account?: string; lotId?: string; from?: string; to?: string } = {}) =>
    url("/payments/export.csv", query),

  /* inbox */
  notifications: () => apiFetch<AppNotification[]>("/notifications"),
  markRead: (id: string) => apiFetch<void>(`/notifications/${id}/read`, { method: "POST" }),

  /* farm inputs */
  listings: (query: Query = {}) => apiFetch<InputListing[]>("/listings", { query }),
  createListing: (body: ListingInput) => apiFetch<InputListing>("/listings", { method: "POST", body: json(body) }),
  updateListing: (id: string, body: Partial<ListingInput>) =>
    apiFetch<InputListing>(`/listings/${id}`, { method: "PUT", body: json(body) }),
  createOrder: (body: { listingId: string; qty: number }) => apiFetch<Order>("/orders", { method: "POST", body: json(body) }),
  confirmOrder: (id: string, txHash: string) =>
    apiFetch<Order>(`/orders/${id}/confirm`, { method: "POST", body: json({ txHash }) }),
  myOrders: () => apiFetch<Order[]>("/orders/mine"),

  /* NEAR Intents 1Click (mainnet, dry quotes) */
  intentsTokens: () => apiFetch<{ tokens: IntentsToken[]; fetchedAt?: string } | IntentsToken[]>("/intents/tokens"),
  intentsQuote: (body: IntentsQuoteRequest) =>
    apiFetch<IntentsQuoteResponse>("/intents/quote", { method: "POST", body: json({ dry: true, ...body }) }),
};
