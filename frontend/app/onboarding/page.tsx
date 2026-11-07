import { OnboardingView } from "@/app/onboarding/_components/onboarding-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Mulai",
  description: "Masuk dengan HOT Wallet atau Meteor, pilih peran Anda — petani, pembeli, verifikator, atau toko tani — dan lengkapi profil.",
  path: "/onboarding",
  noIndex: true,
});

export default function OnboardingPage() {
  return <OnboardingView />;
}
