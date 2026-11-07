import { Suspense } from "react";

import { LotDetail } from "@/app/lot/[id]/_components/lot-detail";
import { LotDetailSkeleton } from "@/app/lot/[id]/_components/lot-detail-skeleton";
import { env } from "@/lib/env";
import { serverT } from "@/lib/i18n";
import { formatKg, formatUsdc, usdcToDecimal } from "@/lib/near/format";
import { getLotForSeo } from "@/lib/server/lots";
import { createMetadata, jsonLdScript, site } from "@/lib/seo";

import type { Metadata } from "next";

export async function generateMetadata({ params }: PageProps<"/lot/[id]">): Promise<Metadata> {
  const { id } = await params;
  const lotId = decodeURIComponent(id);
  const lot = await getLotForSeo(lotId);
  const t = serverT("id");
  if (!lot) {
    return createMetadata({ title: `Lot ${lotId}`, path: `/lot/${encodeURIComponent(lotId)}`, noIndex: true });
  }
  const title = t("lot.metaTitle", { crop: [lot.crop, lot.variety].filter(Boolean).join(" "), kg: formatKg(lot.projected_kg), region: lot.region });
  const price = lot.price_per_kg !== "0" ? ` Total ${formatUsdc(lot.funding_total)} pUSDC.` : "";
  return createMetadata({
    title,
    description: `${lot.lot_id} · ${t(`status.${lot.status}`)} · ${lot.attestations.length} bukti verifikasi.${price} Lihat bukti dan danai panen ini di Pratala.`,
    path: `/lot/${encodeURIComponent(lot.lot_id)}`,
    image: { url: `/lot/${encodeURIComponent(lot.lot_id)}/opengraph-image`, width: 1200, height: 630, alt: title },
    keywords: [lot.crop, lot.region],
  });
}

async function LotJsonLd({ params }: { params: PageProps<"/lot/[id]">["params"] }) {
  const { id } = await params;
  const lot = await getLotForSeo(decodeURIComponent(id));
  if (!lot) return null;
  const url = `${site.url}/lot/${encodeURIComponent(lot.lot_id)}`;
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${lot.crop}${lot.variety ? ` ${lot.variety}` : ""} — ${lot.lot_id}`,
    description: `Proyeksi panen ${formatKg(lot.projected_kg)} dari ${lot.region}, bulan panen ${lot.harvest_month}. Diverifikasi ${lot.attestations.length} lapis.`,
    sku: lot.lot_id,
    category: "Agricultural harvest lot",
    url,
    ...(lot.price_per_kg !== "0"
      ? {
          offers: {
            "@type": "Offer",
            url,
            price: usdcToDecimal(lot.funding_total),
            priceCurrency: "USD",
            availability: lot.status === "Listed" ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
            seller: { "@type": "Person", name: lot.farmer_id },
            description: `Settled in pUSDC (testnet stablecoin) on NEAR ${env.network}.`,
          },
        }
      : {}),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />;
}

async function LotDetailFromParams({ params }: { params: PageProps<"/lot/[id]">["params"] }) {
  const { id } = await params;
  return <LotDetail lotId={decodeURIComponent(id)} />;
}

/** The shareable pay link: stepper, trust, funding, money trail, ownership. */
export default function LotPage({ params }: PageProps<"/lot/[id]">) {
  return (
    <>
      <Suspense fallback={null}>
        <LotJsonLd params={params} />
      </Suspense>
      <Suspense fallback={<LotDetailSkeleton />}>
        <LotDetailFromParams params={params} />
      </Suspense>
    </>
  );
}
