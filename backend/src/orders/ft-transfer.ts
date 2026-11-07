import type { TxStatusResult } from '../common/near/types.js';

export interface ExpectedTransfer {
  tokenContract: string;
  buyer: string;
  seller: string;
  amountBase: string;
  memo: string;
}

export type TransferCheck = { ok: true } | { ok: false; reason: string };

function decodeArgs(args: unknown): Record<string, unknown> | null {
  if (typeof args === 'object' && args !== null) return args as Record<string, unknown>;
  if (typeof args !== 'string') return null;
  try {
    return JSON.parse(Buffer.from(args, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function succeeded(status: unknown): boolean {
  return typeof status === 'object' && status !== null && 'SuccessValue' in status;
}

/**
 * True when the transaction is a successful pUSDC `ft_transfer` from the buyer
 * to the seller for exactly the order amount with memo `order:<uuid>`.
 */
export function verifyFtTransfer(tx: TxStatusResult, exp: ExpectedTransfer): TransferCheck {
  const t = tx.transaction;
  if (t.signer_id !== exp.buyer) return { ok: false, reason: `Signer ${t.signer_id} is not the buyer` };
  if (t.receiver_id !== exp.tokenContract) return { ok: false, reason: `Receiver ${t.receiver_id} is not ${exp.tokenContract}` };
  const match = (t.actions ?? []).some((a) => {
    const fc = (a as { FunctionCall?: { method_name?: string; args?: unknown } }).FunctionCall;
    if (!fc || fc.method_name !== 'ft_transfer') return false;
    const args = decodeArgs(fc.args);
    return (
      args?.receiver_id === exp.seller &&
      String(args.amount) === exp.amountBase &&
      args.memo === exp.memo
    );
  });
  if (!match) return { ok: false, reason: 'No ft_transfer action with the expected receiver, amount and memo' };
  if (!succeeded(tx.status)) return { ok: false, reason: 'Transaction did not succeed' };
  const failedReceipt = (tx.receipts_outcome ?? []).some(
    (r) =>
      r.outcome.executor_id === exp.tokenContract &&
      typeof r.outcome.status === 'object' &&
      r.outcome.status !== null &&
      'Failure' in r.outcome.status,
  );
  if (failedReceipt) return { ok: false, reason: 'Token receipt failed' };
  return { ok: true };
}
