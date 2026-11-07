import { env } from "@/lib/env";

/** NearBlocks links. Format verified against INTERFACES §1: /txns/<hash>, /address/<account>. */
export const explorer = {
  tx: (hash: string) => `${env.explorerBase}/txns/${hash}`,
  account: (accountId: string) => `${env.explorerBase}/address/${accountId}`,
  nft: (contractId: string, tokenId: string) => `${env.explorerBase}/nft-token/${contractId}/${encodeURIComponent(tokenId)}`,
};
