/**
 * NEAR Auth (docs.auth.near.org) client — email/Google/Apple SSO that owns a
 * non-custodial MPC key. The signing key never exists in this app: the Auth0
 * identity deterministically derives it on the MPC network
 * (`derived_public_key` on v1.signer-prod.testnet).
 *
 * Two Auth0 clients share one session (same domain + clientId):
 *  - our own, created with refresh tokens so backend-login tokens are silent;
 *  - the SDK's JavascriptProvider, whose requestTransactionSignature() shows
 *    the "confirm in the login window" popup with the transaction embedded in
 *    the JWT (`fatxn`).
 *
 * Account creation, gas for the `sign` call and each fresh account's gas seed
 * are paid by the Pratala backend sponsor (docs/WALLETS.md §1).
 */
import { Auth0Client } from "@auth0/auth0-spa-js";
import { JavascriptProvider } from "@fast-auth-near/javascript-provider";

import { api, ApiUnavailableError } from "@/lib/api";
import { env } from "@/lib/env";
import { rpc } from "@/lib/near/contracts";

/** ed25519 domain id on the NEAR MPC contract (SDK: getDomainIdOrFail). */
const ED25519_DOMAIN_ID = 1;

const authKindStorageKey = `pratala:authkind:${env.network}`;

let auth0: Auth0Client | null = null;
let provider: JavascriptProvider | null = null;

export function fastAuthProvider(): JavascriptProvider {
  provider ??= new JavascriptProvider({
    network: env.network,
    clientId: env.fastauthClientId,
  });
  return provider;
}

export function auth0Client(): Auth0Client {
  auth0 ??= new Auth0Client({
    domain: env.fastauthDomain,
    clientId: env.fastauthClientId,
    useRefreshTokens: true,
    cacheLocation: "localstorage",
    authorizationParams: { audience: env.fastauthApiAudience },
  });
  return auth0;
}

/**
 * Redirect-based login: robust against every popup blocker (the login window
 * is the page itself). The browser returns to the app origin with ?code&state,
 * and the wallet provider's boot restore finishes the flow (the shared testnet
 * client allows the bare origin).
 */
export async function beginSsoLogin(): Promise<void> {
  // Plain login asks for the tenant's default audience: the shared client only
  // issues signing-audience tokens together with a transaction payload (that
  // happens per action in signer.ts). offline_access keeps tokens silent.
  await auth0Client().loginWithRedirect({
    authorizationParams: {
      audience: env.fastauthApiAudience,
      scope: "openid profile email offline_access",
      redirect_uri: location.origin,
    },
  });
}

/** Silent (refresh-token backed) token for backend login and sponsorship. */
export async function ssoToken(): Promise<string> {
  const token = await auth0Client().getTokenSilently({
    authorizationParams: { audience: env.fastauthApiAudience },
  });
  if (!token) throw new Error("No NEAR Auth token available");
  return token;
}

/**
 * Our own client is the session owner (localstorage cache + refresh token);
 * the SDK provider only drives the per-transaction signature popups.
 */
export async function ssoIsLoggedIn(): Promise<boolean> {
  try {
    return await auth0Client().isAuthenticated();
  } catch {
    return false;
  }
}

/** Consumes ?code&state after the login redirect; safe to call repeatedly. */
export async function ssoHandleRedirect(): Promise<void> {
  if (typeof location === "undefined" || !/[?&]code=/.test(location.search)) return;
  try {
    await auth0Client().handleRedirectCallback();
  } catch {
    // Stale or already-used code — the cached session is what matters.
  }
}

export async function ssoLogout(): Promise<void> {
  try {
    await auth0Client().logout({ openUrl: false });
  } catch {
    // Session already gone — nothing to clear.
  }
}

/** The MPC public key this login deterministically owns (ed25519). */
export async function ssoDerivedPublicKey(): Promise<string> {
  const claims = await auth0Client().getIdTokenClaims();
  if (!claims?.sub) throw new Error("No NEAR Auth session on this device");
  // Same derivation path the SDK builds (JavascriptProvider.getPath()).
  const path = `jwt#https://${env.fastauthDomain}/#${claims.sub}`;
  const key = await rpc().callFunction<never>({
    contractId: env.fastauthMpcContractId,
    method: "derived_public_key",
    args: { path, predecessor: env.fastauthContractId, domain_id: ED25519_DOMAIN_ID },
  });
  return key as unknown as string;
}

/**
 * Legacy fallback account id (u + 10 hex of sha256(publicKey)) for accounts
 * created before users chose their own names. Only consulted when the API is
 * unreachable, so a returning user can still be recognised offline.
 */
export async function ssoFallbackAccountId(publicKey: string): Promise<string> {
  const digest = new TextEncoder().encode(publicKey);
  const hash = await crypto.subtle.digest("SHA-256", digest);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `u${hex.slice(0, 10)}.${env.ssoAccountRoot}`;
}

export async function accountExistsOnChain(accountId: string): Promise<boolean> {
  return rpc()
    .viewAccount({ accountId })
    .then(() => true)
    .catch(() => false);
}

/** The full account id for a user-chosen label, e.g. `siti` → `siti.<sponsor>`. */
export function ssoAccountIdForLabel(label: string): string {
  return `${label}.${env.ssoAccountRoot}`;
}

/** Valid labels: 2–32 chars, lowercase letters/digits/-/_ , no leading/trailing -. */
export const SSO_LABEL_PATTERN = /^[a-z0-9][a-z0-9_-]{0,30}[a-z0-9]$/;

/** Login's email local part (sanitised) as a name suggestion, when known. */
export async function ssoEmailSuggestion(): Promise<string | null> {
  try {
    const claims = await auth0Client().getIdTokenClaims();
    const email = claims?.email;
    if (typeof email !== "string" || !email.includes("@")) return null;
    const local = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_-]/g, "");
    return SSO_LABEL_PATTERN.test(local) ? local : null;
  } catch {
    return null;
  }
}

/**
 * The login's identity: its MPC public key plus the account it already owns
 * (null on first visit — the user hasn't chosen a name yet). When the API is
 * unreachable, falls back to recognising a legacy auto-named account on-chain
 * so a returning user is not asked to name a second account.
 */
export async function getSsoIdentity(): Promise<{ publicKey: string; accountId: string | null }> {
  const publicKey = await ssoDerivedPublicKey();
  try {
    const token = await ssoToken();
    return await api.fastauthResolveAccount({ token });
  } catch (error) {
    if (error instanceof ApiUnavailableError) {
      const fallback = await ssoFallbackAccountId(publicKey);
      if (await accountExistsOnChain(fallback)) return { publicKey, accountId: fallback };
    }
    throw error;
  }
}

/** Ask the sponsor wallet to create + fund the chosen account (once per login). */
export async function sponsorCreateAccount(accountId: string, publicKey: string): Promise<string> {
  const token = await ssoToken();
  const res = await api.fastauthCreateAccount({ accountId, publicKey, token });
  return res.txHash;
}

/** Backend session for SSO users (replaces the NEP-413 flow for this path). */
export async function verifySsoSession(accountId: string, publicKey: string): Promise<void> {
  const token = await ssoToken();
  await api.verifySso({ accountId, publicKey, token });
}

/** Marks the SSO path as the active sign-in on this device. */
export function markSsoActive(): void {
  try {
    localStorage.setItem(authKindStorageKey, "sso");
  } catch {
    // private mode
  }
}
