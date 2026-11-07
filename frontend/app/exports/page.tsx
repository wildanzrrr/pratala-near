import { ExportsView } from "@/app/exports/_components/exports-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Ledger",
  description: "Every funding, farmer payout, refund and fee — with a proof link on the NEAR explorer and a CSV for bookkeeping.",
  path: "/exports",
});

export default function ExportsPage() {
  return <ExportsView />;
}
