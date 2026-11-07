import { SupplierView } from "@/app/supplier/_components/supplier-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({ title: "Farm-input supplier", path: "/supplier", noIndex: true });

export default function SupplierPage() {
  return <SupplierView />;
}
