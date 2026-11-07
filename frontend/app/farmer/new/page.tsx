import { RegisterWizard } from "@/app/farmer/new/_components/register-wizard";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({ title: "Daftarkan panen", path: "/farmer/new", noIndex: true });

export default function NewLotPage() {
  return <RegisterWizard />;
}
