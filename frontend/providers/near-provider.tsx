"use client";

/**
 * NEAR wallet provider — two sign-in paths behind one surface.
 *
 * Wallet path: one NearConnector (@hot-labs/near-connect 0.12) per app load,
 * with the function-call-key-plugin 2.2 registered for the lots contract: at
 * sign-in the wallet adds a limited key for FC_METHODS (0.25 NEAR allowance),
 * after which zero-deposit calls to those methods sign locally — no popup.
 *
 * SSO path (email/Google via NEAR Auth, docs/WALLETS.md §1): login creates no
 * key material locally — the Auth0 identity owns an MPC key on
 * v1.signer-prod.testnet. Fresh accounts are created and gas-seeded by the
 * backend sponsor; deposit transactions pop the Auth0 confirm window once
 * (MPC-signed via the fast-auth contract), everything FC-eligible signs
 * locally once the quick-signing key is added. The context mirrors
 * near-connect-hooks' `useNearWallet` surface so the near-dapp skill's
 * patterns apply, and adds `wallets` for our own connect sheet.
 */
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NearConnector } from "@hot-labs/near-connect";
import { createAccessKeyPlugin } from "function-call-key-plugin";

import { env } from "@/lib/env";
import {
  beginSsoLogin,
  getSsoIdentity,
  markSsoActive,
  sponsorCreateAccount,
  ssoAccountIdForLabel,
  ssoHandleRedirect,
  ssoIsLoggedIn,
  ssoLogout,
  verifySsoSession,
} from "@/lib/fastauth/client";
import {
  clearSsoFcKey,
  ensureSsoFcKey,
  loadSsoFcKeyPair,
  signSsoSilent,
  signSsoTransaction,
} from "@/lib/fastauth/signer";
import { FC_KEY_ALLOWANCE, FC_METHODS } from "@/lib/near/contracts";

import type { NearWalletBase, SignedMessage, WalletManifest } from "@hot-labs/near-connect";
import type { ReactNode } from "react";
import type { TxRequest } from "@/lib/near/contracts";

export interface WalletOption {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** manifest declares testnet support (NearConnector filters on this for testnet) */
  supportsNetwork: boolean;
  signMessage: boolean;
}

export type AuthKind = "wallet" | "sso";

export interface NearContextValue {
  network: "testnet" | "mainnet";
  /** "" while signed out — same contract as near-connect-hooks */
  signedAccountId: string;
  /** which sign-in path is active: an external wallet or the email SSO account */
  authKind: AuthKind | null;
  walletId: string | null;
  loading: boolean;
  wallets: WalletOption[];
  walletsReady: boolean;
  /** true when a local function-call key for the lots contract exists */
  hasFunctionCallKey: boolean;
  connect: (walletId?: string) => Promise<string>;
  /** Email/Google SSO — login redirect; account naming happens in onboarding. */
  connectEmail: () => Promise<void>;
  /** True when an email login exists but its account (name) is not created yet. */
  ssoPending: boolean;
  /** Creates the pending email login's account under a user-chosen name. */
  createEmailAccount: (label: string) => Promise<string>;
  signOut: () => Promise<void>;
  signAndSendTransaction: (tx: TxRequest) => Promise<unknown>;
  signAndSendTransactions: (txs: TxRequest[]) => Promise<unknown[]>;
  signMessage: (params: { message: string; recipient: string; nonce: Uint8Array }) => Promise<SignedMessage>;
  supportsSignMessage: boolean;
}

const NearContext = createContext<NearContextValue | null>(null);

const fcStorageKey = (accountId: string) => `access_key::plugin::${env.network}::${accountId}`;
const authKindStorageKey = `pratala:authkind:${env.network}`;

function readFcKey(accountId: string): boolean {
  if (!accountId || typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(fcStorageKey(accountId)) !== null;
  } catch {
    return false;
  }
}

function toOption(manifest: WalletManifest, network: "testnet" | "mainnet"): WalletOption {
  return {
    id: manifest.id,
    name: manifest.name,
    icon: manifest.icon,
    description: manifest.description,
    supportsNetwork: network === "mainnet" ? manifest.features?.mainnet !== false : manifest.features?.testnet === true,
    signMessage: manifest.features?.signMessage === true,
  };
}

/** SSO session state: the account id plus the MPC key that owns it. */
interface SsoSession {
  accountId: string;
  mpcPublicKey: string;
}

export function NearProvider({ children }: { children: ReactNode }) {
  const connectorRef = useRef<NearConnector | null>(null);
  const readyRef = useRef<Promise<void> | null>(null);
  const [wallet, setWallet] = useState<NearWalletBase | null>(null);
  const [signedAccountId, setSignedAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [walletsReady, setWalletsReady] = useState(false);
  const [fcVersion, setFcVersion] = useState(0);
  const [sso, setSso] = useState<SsoSession | null>(null);
  /** Logged in via SSO but no account yet — the user must choose a name. */
  const [ssoPending, setSsoPending] = useState<SsoSession | null>(null);

  useEffect(() => {
    const providers = { [env.network]: [env.rpcUrl] };
    const connector = new NearConnector({ network: env.network, providers, footerBranding: null });
    connectorRef.current = connector;

    const plugin = createAccessKeyPlugin({
      network: env.network,
      providers,
      signIn: { contractId: env.lotsContractId, methodNames: [...FC_METHODS], allowance: FC_KEY_ALLOWANCE },
    });

    const refreshWallets = () => setWallets(connector.wallets.map((w) => toOption(w.manifest, env.network)));

    const onSignIn = async (payload: { wallet: NearWalletBase; accounts: { accountId: string }[] }) => {
      setSso(null);
      setSsoPending(null);
      setWallet(payload.wallet);
      setSignedAccountId(payload.accounts[0]?.accountId ?? "");
      setFcVersion((v) => v + 1);
    };
    const onSignOut = () => {
      setWallet(null);
      setSignedAccountId("");
      setFcVersion((v) => v + 1);
    };

    connector.on("wallet:signIn", onSignIn);
    connector.on("wallet:signOut", onSignOut);
    connector.on("selector:walletsChanged", refreshWallets);

    /**
     * SSO session restore, also the landing path of the redirect login. A
     * returning login resolves to the account it already owns; a first-time
     * login becomes "pending" (no account yet) until the user chooses a name
     * in onboarding. Returns true when the Auth0 session was restored.
     */
    const restoreSso = async (lastKindKnown: boolean, cancelledRef: boolean, walletConnected: boolean): Promise<boolean> => {
      const returningFromLogin = typeof location !== "undefined" && /[?&]code=/.test(location.search);
      // Also self-heal a half-finished first login: when no wallet is
      // connected, an existing Auth0 session is worth restoring even without
      // the flag or a fresh code.
      if (walletConnected && !lastKindKnown && !returningFromLogin) return false;
      try {
        if (returningFromLogin) await ssoHandleRedirect();
        if (!(await ssoIsLoggedIn())) return false;
        const identity = await getSsoIdentity();
        if (cancelledRef) return true;
        if (identity.accountId) {
          setSsoPending(null);
          setSso({ accountId: identity.accountId, mpcPublicKey: identity.publicKey });
          setSignedAccountId(identity.accountId);
          // Re-confirm the backend session (idempotent); a failure only
          // costs uploads/inbox, not chain features.
          void verifySsoSession(identity.accountId, identity.publicKey).catch(
            (error: unknown) => console.warn("[pratala] sso session re-confirm failed", error),
          );
          markSsoActive();
        } else {
          // First visit: no account until a name is chosen in onboarding.
          setSso(null);
          setSsoPending({ accountId: "", mpcPublicKey: identity.publicKey });
          setSignedAccountId("");
        }
        if (returningFromLogin) history.replaceState(null, "", location.pathname);
        return true;
      } catch {
        return false; // Auth0 session expired — stay signed out.
      }
    };

    let cancelled = false;
    readyRef.current = (async () => {
      await connector.use(plugin);
      if (cancelled) return;
      refreshWallets();
      setWalletsReady(true);
      const connected = await connector.getConnectedWallet().catch(() => null);
      if (cancelled) return;
      // Restore whichever path was used last: an external wallet, or the
      // email SSO session (Auth0 silent refresh, no popup).
      const lastKind = (() => {
        try {
          return localStorage.getItem(authKindStorageKey) as AuthKind | null;
        } catch {
          return null;
        }
      })();
      if (connected && lastKind !== "sso") {
        setWallet(connected.wallet);
        setSignedAccountId(connected.accounts[0]?.accountId ?? "");
      } else if (await restoreSso(lastKind === "sso", cancelled, Boolean(connected))) {
        // restoreSso set the state itself.
      }
    })()
      .catch((error: unknown) => console.warn("[pratala] wallet init failed", error))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
      connector.removeAllListeners("wallet:signIn");
      connector.removeAllListeners("wallet:signOut");
      connector.removeAllListeners("selector:walletsChanged");
    };
  }, []);

  const connect = useCallback(async (walletId?: string) => {
    const connector = connectorRef.current;
    if (!connector) throw new Error("Wallet connector not ready");
    await readyRef.current;
    const connected = await connector.connect(walletId ? { walletId } : {});
    const accounts = await connected.getAccounts();
    const accountId = accounts[0]?.accountId ?? "";
    setSso(null);
    setWallet(connected);
    setSignedAccountId(accountId);
    setFcVersion((v) => v + 1);
    try {
      localStorage.setItem(authKindStorageKey, "wallet");
    } catch {
      // private mode
    }
    return accountId;
  }, []);

  /**
   * Email SSO entry point: redirects the page to the login window (no popups
   * to block). The provider's boot restore finishes the flow on return — a
   * returning login resolves its account, a first login becomes "pending"
   * until a name is chosen in onboarding.
   */
  const connectEmail = useCallback(async () => {
    await beginSsoLogin();
  }, []);

  /**
   * Creates the pending SSO login's account under the user-chosen name
   * (`<label>.<sponsor root>`), gas-seeded by the platform sponsor, then sets
   * the backend session and activates the account. Only valid while an email
   * sign-in is pending (no account yet).
   */
  const createEmailAccount = useCallback(async (label: string) => {
    if (!ssoPending) throw new Error("No email sign-in waiting for an account name");
    const accountId = ssoAccountIdForLabel(label);
    await sponsorCreateAccount(accountId, ssoPending.mpcPublicKey);
    await verifySsoSession(accountId, ssoPending.mpcPublicKey);
    markSsoActive();
    setSsoPending(null);
    setSso({ accountId, mpcPublicKey: ssoPending.mpcPublicKey });
    setSignedAccountId(accountId);
    setFcVersion((v) => v + 1);
    return accountId;
  }, [ssoPending]);

  const signOut = useCallback(async () => {
    if (sso || ssoPending) {
      if (sso) clearSsoFcKey(sso.accountId);
      await ssoLogout();
      setSso(null);
      setSsoPending(null);
      setSignedAccountId("");
      try {
        localStorage.removeItem(authKindStorageKey);
      } catch {
        // private mode
      }
      return;
    }
    const connector = connectorRef.current;
    if (!connector) return;
    await connector.disconnect(wallet ?? undefined).catch(() => undefined);
    setWallet(null);
    setSignedAccountId("");
  }, [sso, ssoPending, wallet]);

  const activeWallet = useCallback(async () => {
    const connector = connectorRef.current;
    if (!connector) throw new Error("Wallet connector not ready");
    await readyRef.current;
    return connector.wallet();
  }, []);

  const signAndSendTransaction = useCallback(
    async (tx: TxRequest) => {
      if (sso) {
        if (tx.silent && !loadSsoFcKeyPair(sso.accountId)) {
          // First silent-eligible action on this device: ONE confirmation
          // adds the quick-signing key; when it lands, the action itself is
          // signed silently below, in the same click. A declined or blocked
          // window stops here — never a surprise second popup.
          await ensureSsoFcKey(sso.accountId, sso.mpcPublicKey);
          setFcVersion((v) => v + 1);
        }
        if (tx.silent && loadSsoFcKeyPair(sso.accountId)) {
          return signSsoSilent(sso.accountId, tx);
        }
        return signSsoTransaction(sso.accountId, sso.mpcPublicKey, tx);
      }
      const w = await activeWallet();
      return w.signAndSendTransaction({ receiverId: tx.receiverId, actions: tx.actions, signerId: signedAccountId || undefined });
    },
    [activeWallet, signedAccountId, sso],
  );

  const signAndSendTransactions = useCallback(
    async (txs: TxRequest[]) => {
      if (sso) {
        const outcomes: unknown[] = [];
        for (const tx of txs) outcomes.push(await signAndSendTransaction(tx));
        return outcomes;
      }
      const w = await activeWallet();
      return w.signAndSendTransactions({
        transactions: txs.map((t) => ({ receiverId: t.receiverId, actions: t.actions })),
        signerId: signedAccountId || undefined,
      });
    },
    [activeWallet, signedAccountId, sso, signAndSendTransaction],
  );

  const signMessage = useCallback(
    async (params: { message: string; recipient: string; nonce: Uint8Array }) => {
      if (sso) throw new Error("Message signing is not available for email accounts");
      const w = await activeWallet();
      return w.signMessage({ ...params, network: env.network, signerId: signedAccountId || undefined });
    },
    [activeWallet, signedAccountId, sso],
  );

  const walletId = wallet?.manifest.id ?? null;
  const authKind: AuthKind | null = sso ? "sso" : signedAccountId ? "wallet" : null;
  // fcVersion invalidates the localStorage read after sign-in / sign-out.
  const hasFunctionCallKey = useMemo(() => {
    void fcVersion;
    if (sso) return loadSsoFcKeyPair(sso.accountId) !== null;
    return readFcKey(signedAccountId);
  }, [signedAccountId, fcVersion, sso]);

  const value = useMemo<NearContextValue>(
    () => ({
      network: env.network,
      signedAccountId,
      authKind,
      walletId,
      loading,
      wallets,
      walletsReady,
      hasFunctionCallKey,
      connect,
      connectEmail,
      ssoPending: ssoPending !== null,
      createEmailAccount,
      signOut,
      signAndSendTransaction,
      signAndSendTransactions,
      signMessage,
      supportsSignMessage: sso ? false : wallet?.manifest.features?.signMessage !== false,
    }),
    [
      signedAccountId,
      authKind,
      walletId,
      loading,
      wallets,
      walletsReady,
      hasFunctionCallKey,
      connect,
      connectEmail,
      createEmailAccount,
      ssoPending,
      signOut,
      signAndSendTransaction,
      signAndSendTransactions,
      signMessage,
      sso,
      wallet,
    ],
  );

  return <NearContext value={value}>{children}</NearContext>;
}

export function useNear(): NearContextValue {
  const ctx = use(NearContext);
  if (!ctx) throw new Error("useNear must be used inside <NearProvider>");
  return ctx;
}
