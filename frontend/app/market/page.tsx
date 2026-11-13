import { MarketView } from "@/app/market/_components/market-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Harvest market",
  description: "Harvest lots verified by field agents and cooperatives, ready to fund with USDC on NEAR, plus farm inputs from local suppliers.",
  path: "/market",
});

export default function MarketPage() {
  return <MarketView />;
}
