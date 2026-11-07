import { FarmerDashboard } from "@/app/farmer/_components/farmer-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({ title: "My harvests", path: "/farmer", noIndex: true });

export default function FarmerPage() {
  return <FarmerDashboard />;
}
