import "server-only";

import { cacheLife } from "next/cache";

import { env } from "@/lib/env";
import { fixtures } from "@/lib/fixtures";
import { getLot, getLots } from "@/lib/near/contracts";

import type { LotView } from "@/lib/near/types";

/**
 * Server-side chain reads for metadata, JSON-LD, OG images and the sitemap.
 * Cached for minutes; never throws (an undeployed contract returns null / []).
 */
export async function getLotForSeo(lotId: string): Promise<LotView | null> {
  "use cache";
  cacheLife("minutes");
  try {
    return env.demoFixtures ? await fixtures.lot(lotId) : await getLot(lotId);
  } catch {
    return null;
  }
}

export async function getLotIdsForSitemap(): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  try {
    const lots = env.demoFixtures ? await fixtures.lots() : await getLots(0, 100);
    return lots.filter((l) => l.status !== "Cancelled").map((l) => l.lot_id);
  } catch {
    return [];
  }
}
