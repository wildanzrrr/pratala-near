import { site } from "@/lib/seo";
import { getLotIdsForSitemap } from "@/lib/server/lots";

import type { MetadataRoute } from "next";

/** Static public routes + every non-cancelled lot pay link (read from chain, cached hourly). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lotIds = await getLotIdsForSitemap();
  const page = (path: string, priority: number, changeFrequency: "daily" | "hourly" | "weekly") => ({
    url: `${site.url}${path}`,
    changeFrequency,
    priority,
  });
  return [
    page("/", 1, "weekly"),
    page("/market", 0.9, "hourly"),
    page("/activity", 0.6, "hourly"),
    page("/exports", 0.4, "daily"),
    page("/faucet", 0.3, "weekly"),
    ...lotIds.map((id) => page(`/lot/${encodeURIComponent(id)}`, 0.8, "hourly")),
  ];
}
