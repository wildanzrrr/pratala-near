import { AdminView } from "@/app/admin/_components/admin-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({ title: "Admin", path: "/admin", noIndex: true });

export default function AdminPage() {
  return <AdminView />;
}
