import { OnboardingView } from "@/app/onboarding/_components/onboarding-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Get started",
  description: "Sign in with email or Google (we create your account), pick your role — farmer, buyer, verifier or farm-input supplier — and complete your profile.",
  path: "/onboarding",
  noIndex: true,
});

export default function OnboardingPage() {
  return <OnboardingView />;
}
