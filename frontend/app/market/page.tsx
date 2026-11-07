import { MarketView } from "@/app/market/_components/market-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Pasar panen",
  description: "Lot panen yang sudah diverifikasi penyuluh dan koperasi, siap didanai dengan pUSDC di NEAR, serta kebutuhan tani dari toko lokal.",
  path: "/market",
});

export default function MarketPage() {
  return <MarketView />;
}
