/**
 * Typed failures the UI renders as states, not crashes.
 *
 * near-api-js 7 throws AccountDoesNotExistError / ContractCodeDoesNotExistError /
 * ContractMethodNotFoundError for an undeployed contract. Class names can be
 * mangled by minifiers, so classification also matches the RPC message text.
 */

export class ContractNotDeployedError extends Error {
  readonly contractId: string;
  constructor(contractId: string, cause?: unknown) {
    super(`Contract ${contractId} is not deployed yet`, { cause });
    this.name = "ContractNotDeployedError";
    this.contractId = contractId;
  }
}

export class ChainUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("NEAR RPC is unreachable", { cause });
    this.name = "ChainUnavailableError";
  }
}

export class WalletRejectedError extends Error {
  constructor(cause?: unknown) {
    super("The request was cancelled in the wallet", { cause });
    this.name = "WalletRejectedError";
  }
}

const NOT_DEPLOYED =
  /does not exist|AccountDoesNotExist|CodeDoesNotExist|Contract code for contract ID|MethodNotFound|method is not found|CompilationError/i;
const NETWORK = /fetch failed|Failed to fetch|NetworkError|ECONNREFUSED|ETIMEDOUT|timeout|503|502|504/i;
const REJECTED = /reject|cancel|closed|denied|User rejected/i;

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  return String(error);
}

export function classifyViewError(error: unknown, contractId: string): Error {
  const text = describe(error);
  if (NOT_DEPLOYED.test(text)) return new ContractNotDeployedError(contractId, error);
  if (NETWORK.test(text)) return new ChainUnavailableError(error);
  return error instanceof Error ? error : new Error(text);
}

export function classifyTxError(error: unknown): Error {
  const text = describe(error);
  if (REJECTED.test(text)) return new WalletRejectedError(error);
  if (NOT_DEPLOYED.test(text)) return new ContractNotDeployedError("contract", error);
  return error instanceof Error ? error : new Error(text);
}

export function isNotDeployed(error: unknown): error is ContractNotDeployedError {
  return error instanceof ContractNotDeployedError;
}

/** Contract panics arrive as `Smart contract panicked: <msg>`; pull the human part out. */
export function contractPanicMessage(error: unknown): string | null {
  const match = describe(error).match(/panicked(?: at)?:?\s*([^"\n]+)/i);
  return match?.[1]?.trim() ?? null;
}
