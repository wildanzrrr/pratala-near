import { VerifyView } from "@/app/verify/_components/verify-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({ title: "Verify", path: "/verify", noIndex: true });

export default function VerifyPage() {
  return <VerifyView />;
}
