"use client";

/**
 * Onboarding is not optional: anyone signed in (wallet or email SSO) without a
 * profile is kept on /onboarding until registration completes. A pending email
 * login (account name not chosen yet) is sent there too. The profile check is
 * remote-first with the device-local profile as fallback, so the gate also
 * works when the API is offline.
 */
import { useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import { usePublicProfile } from "@/hooks/queries/use-public-profile";
import { loadLocalProfile } from "@/lib/profile";
import { useNear } from "@/providers/near-provider";

export function OnboardingGate() {
  const pathname = usePathname();
  const router = useRouter();
  const { signedAccountId, ssoPending, loading } = useNear();
  const profile = usePublicProfile(signedAccountId || undefined);

  useEffect(() => {
    if (loading || pathname === "/onboarding") return;
    if (ssoPending) {
      router.replace("/onboarding");
      return;
    }
    if (!signedAccountId) return;
    const remote = profile.data;
    const hasProfile =
      loadLocalProfile(signedAccountId) !== null || Boolean(remote?.displayName || remote?.intent);
    // Wait for the remote check unless the API is unreachable or the local
    // profile already answers the question.
    const settled = hasProfile || profile.isSuccess || profile.isError;
    if (settled && !hasProfile) router.replace("/onboarding");
  }, [loading, pathname, profile.data, profile.isSuccess, profile.isError, router, signedAccountId, ssoPending]);

  return null;
}
