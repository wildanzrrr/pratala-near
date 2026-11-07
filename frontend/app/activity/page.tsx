import { ActivityView } from "@/app/activity/_components/activity-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Aktivitas",
  description: "Semua langkah lot panen terbaru — pendaftaran, verifikasi, pendanaan, timbangan — dibaca langsung dari kontrak NEAR.",
  path: "/activity",
});

export default function ActivityPage() {
  return <ActivityView />;
}
