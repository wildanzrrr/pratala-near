import { useQuery } from "@tanstack/react-query";

import { env } from "@/lib/env";
import { fixtures } from "@/lib/fixtures";
import { getSharesForOwner } from "@/lib/near/contracts";
import { lotKeys } from "@/hooks/queries/use-lot";

/** A buyer's kg share NFTs ("lot-N:M"), with entitlements after settlement. */
export function useSharesForOwner(accountId: string | null | undefined) {
  return useQuery({
    queryKey: lotKeys.sharesForOwner(accountId ?? ""),
    queryFn: () => (env.demoFixtures ? fixtures.sharesForOwner(accountId!) : getSharesForOwner(accountId!)),
    enabled: Boolean(accountId),
  });
}
