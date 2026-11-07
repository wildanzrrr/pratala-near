import { site } from "@/lib/seo";

import type { MetadataRoute } from "next";

/** Public: landing, market, lot pay links, activity, ledger. Personal/utility screens stay out of the index. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/checkout/", "/receipt/", "/onboarding", "/farmer", "/verify", "/portfolio", "/supplier", "/admin"],
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
