import { ExportsView } from "@/app/exports/_components/exports-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Buku besar",
  description: "Setiap pendanaan, pembayaran petani, pengembalian, dan biaya — dengan tautan bukti di explorer NEAR dan CSV untuk pembukuan.",
  path: "/exports",
});

export default function ExportsPage() {
  return <ExportsView />;
}
