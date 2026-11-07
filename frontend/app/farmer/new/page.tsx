import { RegisterWizard } from "@/app/farmer/new/_components/register-wizard";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({ title: "Register a harvest", path: "/farmer/new", noIndex: true });

export default function NewLotPage() {
  return <RegisterWizard />;
}
