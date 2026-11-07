"use client";

/**
 * NEAR wallet provider.
 *
 * One NearConnector (@hot-labs/near-connect 0.12) per app load, with the
 * function-call-key-plugin 2.2 registered for the lots contract: at sign-in the
 * wallet adds a limited key for FC_METHODS (0.25 NEAR allowance), after which
 * zero-deposit calls to those methods sign locally — no popup. Everything else
 * falls through to the wallet.
 *
 * The context mirrors near-connect-hooks' `useNearWallet` surface
 * (signedAccountId, loading, signIn/connect, signOut, signAndSendTransaction(s),
 * signMessage) so the near-dapp skill's patterns apply, and adds `wallets` for
 * our own connect sheet.
 */
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NearConnector } from "@hot-labs/near-connect";
import { createAccessKeyPlugin } from "function-call-key-plugin";

import { env } from "@/lib/env";
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

export interface NearContextValue {
  network: "testnet" | "mainnet";
  /** "" while signed out — same contract as near-connect-hooks */
  signedAccountId: string;
  walletId: string | null;
  loading: boolean;
  wallets: WalletOption[];
  walletsReady: boolean;
  /** true when a local function-call key for the lots contract exists */
  hasFunctionCallKey: boolean;
  connect: (walletId?: string) => Promise<string>;
  signOut: () => Promise<void>;
  signAndSendTransaction: (tx: TxRequest) => Promise<unknown>;
  signAndSendTransactions: (txs: TxRequest[]) => Promise<unknown[]>;
  signMessage: (params: { message: string; recipient: string; nonce: Uint8Array }) => Promise<SignedMessage>;
  supportsSignMessage: boolean;
}

const NearContext = createContext<NearContextValue | null>(null);

const fcStorageKey = (accountId: string) => `access_key::plugin::${env.network}::${accountId}`;

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

export function NearProvider({ children }: { children: ReactNode }) {
  const connectorRef = useRef<NearConnector | null>(null);
  const readyRef = useRef<Promise<void> | null>(null);
  const [wallet, setWallet] = useState<NearWalletBase | null>(null);
  const [signedAccountId, setSignedAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [walletsReady, setWalletsReady] = useState(false);
  const [fcVersion, setFcVersion] = useState(0);

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

    let cancelled = false;
    readyRef.current = (async () => {
      await connector.use(plugin);
      if (cancelled) return;
      refreshWallets();
      setWalletsReady(true);
      const connected = await connector.getConnectedWallet().catch(() => null);
      if (cancelled) return;
      if (connected) {
        setWallet(connected.wallet);
        setSignedAccountId(connected.accounts[0]?.accountId ?? "");
      }
    })()
      .catch((error) => console.warn("[pratala] wallet init failed", error))
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
    setWallet(connected);
    setSignedAccountId(accountId);
    setFcVersion((v) => v + 1);
    return accountId;
  }, []);

  const signOut = useCallback(async () => {
    const connector = connectorRef.current;
    if (!connector) return;
    await connector.disconnect(wallet ?? undefined).catch(() => undefined);
    setWallet(null);
    setSignedAccountId("");
  }, [wallet]);

  const activeWallet = useCallback(async () => {
    const connector = connectorRef.current;
    if (!connector) throw new Error("Wallet connector not ready");
    await readyRef.current;
    return connector.wallet();
  }, []);

  const signAndSendTransaction = useCallback(
    async (tx: TxRequest) => {
      const w = await activeWallet();
      return w.signAndSendTransaction({ receiverId: tx.receiverId, actions: tx.actions, signerId: signedAccountId || undefined });
    },
    [activeWallet, signedAccountId],
  );

  const signAndSendTransactions = useCallback(
    async (txs: TxRequest[]) => {
      const w = await activeWallet();
      return w.signAndSendTransactions({
        transactions: txs.map((t) => ({ receiverId: t.receiverId, actions: t.actions })),
        signerId: signedAccountId || undefined,
      });
    },
    [activeWallet, signedAccountId],
  );

  const signMessage = useCallback(
    async (params: { message: string; recipient: string; nonce: Uint8Array }) => {
      const w = await activeWallet();
      return w.signMessage({ ...params, network: env.network, signerId: signedAccountId || undefined });
    },
    [activeWallet, signedAccountId],
  );

  const walletId = wallet?.manifest.id ?? null;
  // fcVersion invalidates the localStorage read after sign-in / sign-out.
  const hasFunctionCallKey = useMemo(() => {
    void fcVersion;
    return readFcKey(signedAccountId);
  }, [signedAccountId, fcVersion]);

  const value = useMemo<NearContextValue>(
    () => ({
      network: env.network,
      signedAccountId,
      walletId,
      loading,
      wallets,
      walletsReady,
      hasFunctionCallKey,
      connect,
      signOut,
      signAndSendTransaction,
      signAndSendTransactions,
      signMessage,
      supportsSignMessage: wallet?.manifest.features?.signMessage !== false,
    }),
    [
      signedAccountId,
      walletId,
      loading,
      wallets,
      walletsReady,
      hasFunctionCallKey,
      connect,
      signOut,
      signAndSendTransaction,
      signAndSendTransactions,
      signMessage,
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
