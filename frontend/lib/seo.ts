import { env } from "@/lib/env";

import type { Metadata } from "next";

/**
 * One source of truth for site-wide defaults (`site`) and one factory
 * (`createMetadata`) every route reuses (mirrors bunkr/lp/lib/seo.ts).
 *
 *   export const metadata = createMetadata({ title: "Pasar", path: "/market" })
 *
 * Client pages can't export metadata — give the segment a layout.tsx and
 * call the factory there.
 */
export const site = {
  name: "Pratala",
  url: env.siteUrl,
  defaultTitle: "Pratala — Panen terverifikasi, dibayar langsung",
  description:
    "Pratala menghubungkan petani, koperasi, dan pembeli tanpa tengkulak. Proyeksi panen yang diverifikasi tiga lapis menjadi NFT di NEAR yang menahan dana pUSDC sampai panen ditimbang.",
  ogImage: {
    url: "/images/rice-field.jpg",
    width: 2100,
    height: 1182,
    alt: "Petani menanam padi di sawah tergenang di Indonesia (foto: Redicul Pict, Unsplash)",
  },
  keywords: [
    "Pratala",
    "pembiayaan panen",
    "harvest financing",
    "petani Indonesia",
    "koperasi",
    "NEAR Protocol",
    "NFT",
    "escrow stablecoin",
    "real-world assets",
    "NEAR Intents",
  ],
  locale: "en_US",
} as const;

export type OgImage = { url: string; width: number; height: number; alt: string };

export type SeoInput = {
  /** Page title without the brand; the factory appends " — Pratala". */
  title?: string;
  description?: string;
  path?: `/${string}`;
  image?: OgImage;
  keywords?: string[];
  noIndex?: boolean;
  ogType?: "website" | "article";
};

export function createMetadata(input: SeoInput = {}): Metadata {
  const title = input.title ? `${input.title} — ${site.name}` : site.defaultTitle;
  const description = input.description ?? site.description;
  const path = input.path ?? "/";
  const image = input.image ?? site.ogImage;
  return {
    metadataBase: new URL(site.url),
    title,
    description,
    applicationName: site.name,
    keywords: [...site.keywords, ...(input.keywords ?? [])],
    alternates: { canonical: path },
    robots: input.noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      type: input.ogType ?? "website",
      siteName: site.name,
      locale: site.locale,
      url: path,
      title,
      description,
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

/** Organization + WebSite structured data, rendered once in the root layout. */
export function siteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: site.name, url: site.url, description: site.description },
      { "@type": "WebSite", name: site.name, url: site.url, inLanguage: "en" },
    ],
  };
}

/** Serialise JSON-LD safely for a <script> tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
