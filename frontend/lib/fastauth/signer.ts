/**
 * Signing for NEAR Auth (email SSO) accounts.
 *
 * Two paths, chosen by providers/near-provider.tsx:
 *  - silent: a local function-call key (added once via the MPC key) signs the
 *    zero-deposit FC_METHODS calls on the lots contract — no popup, exactly
 *    like the function-call-key-plugin does for wallet users;
 *  - popup: everything else (any attached deposit) is signed by the MPC
 *    network: the transaction rides inside the Auth0 JWT (`fatxn`), the
 *    fast-auth contract's guard verifies the JWT on-chain, and our backend
 *    relays the `sign` call (docs/WALLETS.md §1).
 */
import bs58 from "bs58";
import { FastAuthSignature } from "@fast-auth-near/browser-sdk";
import {
  Account,
  KeyPair,
  KeyPairSigner,
  KeyType,
  PublicKey,
  Signature,
  SignedTransaction,
  actions as v7actions,
  createTransaction,
} from "near-api-js";

import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { FC_KEY_ALLOWANCE, FC_METHODS, LOTS, rpc } from "@/lib/near/contracts";
import { WalletRejectedError } from "@/lib/near/errors";
import { fastAuthProvider } from "@/lib/fastauth/client";

import type { ConnectorAction } from "@hot-labs/near-connect";
import type { Action, KeyPairString } from "near-api-js";
import type { TxRequest } from "@/lib/near/contracts";

const fcStorageKey = (accountId: string) => `pratala:sso:fc:${env.network}:${accountId}`;

/** Rejection-looking failures from the Auth0 popup become WalletRejectedError. */
export function classifySsoError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/popup|closed|cancel|denied|timed?\s?out/i.test(message)) {
    return new WalletRejectedError();
  }
  return error instanceof Error ? error : new Error(message);
}

function toV7Action(a: ConnectorAction): Action {
  if (a.type !== "FunctionCall") {
    throw new Error(`Email accounts cannot sign ${a.type} actions`);
  }
  return v7actions.functionCall(
    a.params.methodName,
    a.params.args,
    BigInt(a.params.gas),
    BigInt(a.params.deposit),
  );
}

/** Sign raw v7 actions with the login's MPC key (one Auth0 popup) and send. */
export async function signSsoActions(
  accountId: string,
  mpcPublicKey: string,
  receiverId: string,
  v7Actions: Action[],
): Promise<unknown> {
  const provider = fastAuthProvider();
  const accessKey = await rpc().viewAccessKey({ accountId, publicKey: mpcPublicKey });
  const block = await rpc().viewBlock({ finality: "optimistic" });
  const transaction = createTransaction(
    accountId,
    PublicKey.fromString(mpcPublicKey),
    receiverId,
    BigInt(accessKey.nonce) + 1n,
    v7Actions,
    bs58.decode(block.header.hash),
  );
  try {
    // The SDK's types pin its own near-api-js copy; at runtime the borsh
    // transaction objects are identical, so this boundary crosses as never.
    await provider.requestTransactionSignature({ transaction: transaction as never });
    const { signatureRequest } = await provider.getSignatureRequest();
    const relayed = await api.fastauthSignTx({
      guard_id: signatureRequest.guardId,
      verify_payload: signatureRequest.verifyPayload,
      sign_payload: signatureRequest.signPayload as string | number[],
    });
    const successValue = relayed.result.status?.SuccessValue;
    if (!successValue) {
      const failure = JSON.stringify(relayed.result.status?.Failure ?? "no signature returned");
      throw new Error(`MPC signature failed: ${failure.slice(0, 160)}`);
    }
    const signature = FastAuthSignature.fromBase64(successValue).recover("ed25519");
    const signed = new SignedTransaction({
      transaction,
      signature: new Signature({ keyType: KeyType.ED25519, data: new Uint8Array(signature) }),
    });
    return await rpc().sendTransaction(signed);
  } catch (error) {
    throw classifySsoError(error);
  }
}

/** Sign a TxRequest (contract calls, any deposit) with the MPC key. */
export async function signSsoTransaction(
  accountId: string,
  mpcPublicKey: string,
  tx: TxRequest,
): Promise<unknown> {
  return signSsoActions(accountId, mpcPublicKey, tx.receiverId, tx.actions.map(toV7Action));
}

/* ── local function-call key (silent signing) ─────────────── */

export function loadSsoFcKeyPair(accountId: string): KeyPair | null {
  try {
    const secret = localStorage.getItem(fcStorageKey(accountId));
    return secret ? KeyPair.fromString(secret as KeyPairString) : null;
  } catch {
    return null;
  }
}

function storeSsoFcKeyPair(accountId: string, keyPair: KeyPair): void {
  localStorage.setItem(fcStorageKey(accountId), keyPair.toString());
}

export function clearSsoFcKey(accountId: string): void {
  try {
    localStorage.removeItem(fcStorageKey(accountId));
  } catch {
    // private mode — the key simply won't persist
  }
}

/**
 * Adds a local function-call key to the account through the MPC key (one
 * Auth0 popup right after login). Best-effort: when the popup is blocked we
 * stay on all-popup signing and return false.
 */
export async function ensureSsoFcKey(
  accountId: string,
  mpcPublicKey: string,
): Promise<boolean> {
  if (loadSsoFcKeyPair(accountId)) return true;
  const keyPair = KeyPair.fromRandom("ed25519");
  const addAction = v7actions.addFunctionCallAccessKey(
    keyPair.getPublicKey(),
    LOTS(),
    [...FC_METHODS],
    BigInt(FC_KEY_ALLOWANCE),
  );
  await signSsoActions(accountId, mpcPublicKey, accountId, [addAction]);
  storeSsoFcKeyPair(accountId, keyPair);
  return true;
}

/** Signs a silent-eligible transaction with the local FC key — no popup. */
export async function signSsoSilent(accountId: string, tx: TxRequest): Promise<unknown> {
  const keyPair = loadSsoFcKeyPair(accountId);
  if (!keyPair) throw new Error("No quick-signing key on this device");
  const account = new Account(accountId, rpc(), new KeyPairSigner(keyPair));
  return account.signAndSendTransaction({
    receiverId: tx.receiverId,
    actions: tx.actions.map(toV7Action),
  });
}
