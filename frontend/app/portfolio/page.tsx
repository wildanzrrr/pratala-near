import { PortfolioView } from "@/app/portfolio/_components/portfolio-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({ title: "Portfolio", path: "/portfolio", noIndex: true });

export default function PortfolioPage() {
  return <PortfolioView />;
}
