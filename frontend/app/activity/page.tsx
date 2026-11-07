import { ActivityView } from "@/app/activity/_components/activity-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Activity",
  description: "Every recent harvest-lot step — registration, verification, funding, weigh-in — read straight from the NEAR contract.",
  path: "/activity",
});

export default function ActivityPage() {
  return <ActivityView />;
}
