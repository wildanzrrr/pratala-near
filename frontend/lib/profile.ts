import type { Intent, Profile } from "@/lib/near/types";

const key = (accountId: string) => `pratala:profile:${accountId}`;
const INTENT_KEY = "pratala:intent";

/** Device-local profile so onboarding works with the API offline. Versioned via the key prefix. */
export function loadLocalProfile(accountId: string): Profile | null {
  try {
    const raw = localStorage.getItem(key(accountId));
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function saveLocalProfile(accountId: string, profile: Profile) {
  try {
    localStorage.setItem(key(accountId), JSON.stringify(profile));
    localStorage.setItem(INTENT_KEY, profile.intent);
    window.dispatchEvent(new Event("pratala:profile"));
  } catch {
    /* storage unavailable — profile lives for this session only */
  }
}

export function loadIntent(): Intent | null {
  try {
    const v = localStorage.getItem(INTENT_KEY);
    return v === "farmer" || v === "buyer" || v === "verifier" || v === "supplier" ? v : null;
  } catch {
    return null;
  }
}
