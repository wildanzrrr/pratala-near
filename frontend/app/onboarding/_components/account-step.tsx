"use client";

/**
 * First onboarding step for a fresh email login: choose the account name.
 * The label becomes the user's NEAR address `<label>.<sponsor root>`; the
 * platform sponsor creates and gas-seeds it on confirm. Availability is
 * checked live against the chain, and the backend re-checks on creation.
 */
import { useEffect, useState } from "react";

import { ArrowRight, CheckCircle, Prohibit, Spinner, WarningCircle } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiKeys } from "@/hooks/queries/use-api-health";
import { useLabelAvailability } from "@/app/onboarding/_hooks/use-label-availability";
import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { explorer } from "@/lib/explorer";
import { ssoEmailSuggestion } from "@/lib/fastauth/client";
import { useNear } from "@/providers/near-provider";
import { useT } from "@/providers/locale-provider";

export function AccountStep({ onReady }: { onReady: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const { createEmailAccount } = useNear();
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const availability = useLabelAvailability(label);

  useEffect(() => {
    // Suggest the email's local part (e.g. siti@gmail.com → siti) when clean.
    if (!label) void ssoEmailSuggestion().then((suggestion) => suggestion && setLabel(suggestion));
  }, [label]);

  const fullId = label.trim() ? `${label.trim()}.${env.ssoAccountRoot}` : "";

  async function submit() {
    setError(null);
    setCreating(true);
    try {
      const accountId = await createEmailAccount(label.trim());
      await queryClient.invalidateQueries({ queryKey: apiKeys.me });
      toast.success(t("onboarding.accountCreated", { account: accountId }), {
        action: { label: t("common.viewProof"), onClick: () => window.open(explorer.account(accountId), "_blank", "noopener") },
      });
      onReady();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setError(t("onboarding.accountTaken"));
      else if (e instanceof ApiError && e.status === 400) setError(t("onboarding.accountInvalid"));
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl">{t("onboarding.accountTitle")}</h2>
        <p className="text-sm text-ink-2">{t("onboarding.accountLead")}</p>
      </div>

      <FieldGroup>
        <Field data-invalid={availability === "invalid" ? true : undefined}>
          <FieldLabel htmlFor="account-label">{t("onboarding.accountLabel")}</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              id="account-label"
              value={label}
              onChange={(e) => setLabel(e.target.value.toLowerCase())}
              placeholder={t("onboarding.accountPlaceholder")}
              aria-invalid={availability === "invalid" || availability === "taken"}
              autoComplete="off"
              spellCheck={false}
              className="max-w-64"
            />
            <span className="min-w-0 truncate font-mono text-sm text-muted-foreground">.{env.ssoAccountRoot}</span>
          </div>
          {availability === "invalid" ? (
            <FieldError>{t("onboarding.accountInvalid")}</FieldError>
          ) : null}
          {availability === "checking" ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Spinner className="size-3" /> {t("onboarding.accountChecking")}
            </p>
          ) : null}
          {availability === "free" ? (
            <p className="flex items-center gap-1.5 text-xs text-success-foreground">
              <CheckCircle aria-hidden className="size-3.5" /> {t("onboarding.accountAvailable", { name: fullId })}
            </p>
          ) : null}
          {availability === "taken" ? (
            <p className="flex items-center gap-1.5 text-xs text-attention-foreground">
              <WarningCircle aria-hidden className="size-3.5" /> {t("onboarding.accountTaken")}
            </p>
          ) : null}
        </Field>
      </FieldGroup>

      {error ? (
        <Alert variant="destructive">
          <Prohibit />
          <AlertTitle>{t("onboarding.accountFailed")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <p className="text-xs text-muted-foreground">{t("onboarding.accountSponsorNote")}</p>

      <Button
        size="lg"
        className="w-full sm:w-fit"
        disabled={creating || availability !== "free" || !label.trim()}
        onClick={submit}
      >
        {creating ? <Spinner data-icon="inline-start" /> : null}
        {creating ? t("onboarding.accountCreating") : t("onboarding.accountCreate")}
        {!creating ? <ArrowRight data-icon="inline-end" /> : null}
      </Button>
    </div>
  );
}
