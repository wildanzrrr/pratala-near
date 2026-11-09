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

import { api } from "@/lib/api";
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
 * and the wallet provider's boot restore finishes the flow via
 * `completeSsoLogin()` (the shared testnet client allows the bare origin).
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
 * Stable account id for a derived key: u + 10 hex of sha256(publicKey) under
 * the platform root, so the same login resolves to the same account on every
 * device. The sponsor wallet creates it on first sign-in.
 */
export async function ssoAccountIdFor(publicKey: string): Promise<string> {
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

/** Ask the sponsor wallet to create + fund the account (once per login). */
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

/**
 * Finishes the redirect login on /auth/callback: consume ?code&state (through
 * the provider's session check), derive the MPC key, create + gas-seed the
 * account through the backend sponsor on first use, and set the backend
 * session (no NEP-413 needed on this path). Idempotent for returning users.
 */
export async function completeSsoLogin(): Promise<{ accountId: string; created: boolean }> {
  await ssoHandleRedirect(); // consumes ?code&state after the login redirect
  const loggedIn = await ssoIsLoggedIn();
  if (!loggedIn) throw new Error("Login window did not complete");
  const mpcPublicKey = await ssoDerivedPublicKey();
  const accountId = await ssoAccountIdFor(mpcPublicKey);
  let created = false;
  if (!(await accountExistsOnChain(accountId))) {
    await sponsorCreateAccount(accountId, mpcPublicKey);
    created = true;
  }
  await verifySsoSession(accountId, mpcPublicKey);
  try {
    localStorage.setItem(authKindStorageKey, "sso");
  } catch {
    // private mode
  }
  return { accountId, created };
}
