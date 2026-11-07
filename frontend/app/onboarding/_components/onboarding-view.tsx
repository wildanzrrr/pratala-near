"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check, Info, SealCheck, ShieldCheck } from "@phosphor-icons/react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { CopyButton } from "@/components/common/copy-button";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { PageBody } from "@/components/layout/page-header";
import { ConnectGate } from "@/components/wallet/connect-gate";
import { RolePicker } from "@/app/onboarding/_components/role-picker";
import { homeFor } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { useApiHealth } from "@/hooks/queries/use-api-health";
import { useProfileMutation } from "@/hooks/mutations/use-profile-mutation";
import { useSignInBackendMutation } from "@/hooks/mutations/use-sign-in-backend-mutation";
import { useSession } from "@/hooks/use-session";
import { useLocale } from "@/providers/locale-provider";

import type { Intent } from "@/lib/near/types";

function profileSchema(t: (k: "common.tooShort" | "common.invalidPhone") => string) {
  return z.object({
    displayName: z.string().trim().min(2, t("common.tooShort")).max(80),
    region: z.string().trim().min(2, t("common.tooShort")).max(120),
    phone: z
      .string()
      .trim()
      .max(20)
      .regex(/^[+\d\s-]*$/, t("common.invalidPhone"))
      .optional(),
  });
}
type ProfileForm = z.infer<ReturnType<typeof profileSchema>>;

/** Connect → role → profile. Three short steps; everything can change later. */
export function OnboardingView() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const session = useSession();
  const health = useApiHealth();
  const saveProfile = useProfileMutation();
  const signIn = useSignInBackendMutation();
  const [step, setStep] = useState<1 | 2>(1);
  const [intent, setIntent] = useState<Intent | null>(session.intent);
  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema(t)),
    values: {
      displayName: session.profile?.displayName ?? "",
      region: session.profile?.region ?? "",
      phone: session.profile?.phone ?? "",
    },
  });

  const steps = [t("onboarding.stepConnect"), t("onboarding.stepRole"), t("onboarding.stepProfile")];
  const current = !session.accountId ? 0 : step;

  async function finish(values: ProfileForm) {
    if (!session.accountId || !intent) return;
    const result = await saveProfile.mutateAsync({
      accountId: session.accountId,
      profile: { displayName: values.displayName, region: values.region, phone: values.phone || null, locale, intent },
      signedInToApi: session.signedInToApi,
    });
    toast.success(result.remote ? t("onboarding.savedRemote") : t("onboarding.savedLocal"));
    router.push(homeFor(intent, session.roles));
  }

  return (
    <PageBody className="max-w-3xl">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-3xl sm:text-4xl">{t("onboarding.title")}</h1>
            <p className="text-ink-2">{t("onboarding.lead")}</p>
          </div>
          <LanguageToggle />
        </div>
        <ol className="grid grid-cols-3 gap-2" aria-label={t("onboarding.lead")}>
          {steps.map((label, i) => (
            <li key={label} aria-current={i === current ? "step" : undefined} className="flex flex-col gap-1.5">
              <span className={cn("h-1 rounded-full", i < current ? "bg-primary" : i === current ? "bg-lime" : "bg-border")} />
              <span className={cn("flex items-center gap-1 text-xs", i === current ? "font-medium text-foreground" : "text-muted-foreground")}>
                {i < current ? <Check aria-hidden className="size-3" weight="bold" /> : null}
                {label}
              </span>
            </li>
          ))}
        </ol>
      </header>

      <ConnectGate>
        {step === 1 ? (
          <div className="flex flex-col gap-6">
            <RolePicker value={intent} onChange={setIntent} />
            {intent === "verifier" ? (
              session.verifierRoles.length ? (
                <Alert className="border-primary/30 bg-success">
                  <SealCheck />
                  <AlertDescription className="text-success-foreground">
                    {t("onboarding.verifierHasRole", { roles: session.verifierRoles.map((r) => t(`roles.${r}`)).join(", ") })}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <Info />
                  <AlertDescription className="flex flex-wrap items-center gap-1">
                    {t("onboarding.verifierNoRole", { account: session.accountId ?? "" })}
                    <CopyButton value={session.accountId ?? ""} />
                  </AlertDescription>
                </Alert>
              )
            ) : null}
            <Button size="lg" className="w-full sm:w-fit" disabled={!intent} onClick={() => setStep(2)}>
              {t("common.next")}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        ) : (
          <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(finish)} noValidate>
            <FieldGroup>
              <Field data-invalid={form.formState.errors.displayName ? true : undefined}>
                <FieldLabel htmlFor="displayName">{t("onboarding.name")}</FieldLabel>
                <Input id="displayName" autoComplete="name" placeholder={t("onboarding.namePlaceholder")} aria-invalid={Boolean(form.formState.errors.displayName)} {...form.register("displayName")} />
                <FieldError errors={[form.formState.errors.displayName]} />
              </Field>
              <Field data-invalid={form.formState.errors.region ? true : undefined}>
                <FieldLabel htmlFor="region">{t("onboarding.region")}</FieldLabel>
                <Input id="region" autoComplete="address-level2" placeholder={t("onboarding.regionPlaceholder")} aria-invalid={Boolean(form.formState.errors.region)} {...form.register("region")} />
                <FieldError errors={[form.formState.errors.region]} />
              </Field>
              <Field data-invalid={form.formState.errors.phone ? true : undefined}>
                <FieldLabel htmlFor="phone">
                  {t("onboarding.phone")} <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
                </FieldLabel>
                <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" aria-invalid={Boolean(form.formState.errors.phone)} {...form.register("phone")} />
                <FieldError errors={[form.formState.errors.phone]} />
              </Field>
            </FieldGroup>

            {!health.isError ? (
              <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
                <p className="flex items-center gap-2 font-medium">
                  <ShieldCheck aria-hidden className="size-4 text-primary" />
                  {t("wallet.signInBackend")}
                </p>
                <p className="text-sm text-muted-foreground">{t("wallet.signInBackendLead")}</p>
                {session.signedInToApi ? (
                  <p className="flex items-center gap-1.5 text-sm text-primary">
                    <Check aria-hidden weight="bold" className="size-4" />
                    {t("wallet.backendSignedIn")}
                  </p>
                ) : (
                  <Button type="button" variant="outline" className="w-fit" disabled={signIn.isPending || !session.supportsSignMessage} onClick={() => signIn.mutate()}>
                    {signIn.isPending ? <Spinner data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}
                    {signIn.isPending ? t("wallet.signingIn") : t("wallet.signInBackend")}
                  </Button>
                )}
                {!session.supportsSignMessage ? <p className="text-xs text-muted-foreground">{t("wallet.noSignMessage")}</p> : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="lg" onClick={() => setStep(1)}>
                <ArrowLeft data-icon="inline-start" />
                {t("common.back")}
              </Button>
              <Button type="submit" size="lg" disabled={saveProfile.isPending}>
                {saveProfile.isPending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
                {t("onboarding.finish")}
              </Button>
            </div>
          </form>
        )}
      </ConnectGate>
    </PageBody>
  );
}
