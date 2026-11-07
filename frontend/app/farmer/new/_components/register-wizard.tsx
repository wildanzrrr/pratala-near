"use client";

import { useState } from "react";

import Link from "next/link";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, CheckCircle, Info, Signature } from "@phosphor-icons/react";
import { useForm } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiOfflineBanner } from "@/components/common/api-offline-banner";
import { EvidenceUploader, evidenceDigest } from "@/components/evidence/evidence-uploader";
import { PageBody } from "@/components/layout/page-header";
import { TxStatusLine } from "@/components/money/tx-status-line";
import { ConnectGate } from "@/components/wallet/connect-gate";
import { HarvestStep, PlotStep, ReviewStep } from "@/app/farmer/new/_components/wizard-steps";
import { STEP_FIELDS, currentMonth, wizardSchema } from "@/app/farmer/new/_components/wizard-schema";
import { api } from "@/lib/api";
import { sha256Hex } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useApiHealth } from "@/hooks/queries/use-api-health";
import { useRegisterLotMutation } from "@/hooks/mutations/use-register-lot-mutation";
import { useSession } from "@/hooks/use-session";
import { useLocale } from "@/providers/locale-provider";

import type { EvidenceItem } from "@/components/evidence/evidence-uploader";
import type { WizardInput, WizardValues } from "@/app/farmer/new/_components/wizard-schema";

/**
 * Register a harvest in three steps: plot photos + location → crop & numbers →
 * review & one signature (register_lot, 0.1 NEAR storage deposit).
 */
export function RegisterWizard() {
  const { t } = useLocale();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [doneLot, setDoneLot] = useState<string | null>(null);
  const steps = [t("wizard.step1"), t("wizard.step2"), t("wizard.step3")];

  return (
    <PageBody className="max-w-2xl">
      <header className="flex flex-col gap-4">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/farmer">
            <ArrowLeft data-icon="inline-start" />
            {t("farmer.title")}
          </Link>
        </Button>
        <h1 className="text-3xl sm:text-4xl">{t("wizard.title")}</h1>
        {!doneLot ? (
          <ol className="grid grid-cols-3 gap-2">
            {steps.map((label, i) => (
              <li key={label} aria-current={i + 1 === step ? "step" : undefined} className="flex flex-col gap-1.5">
                <span className={cn("h-1 rounded-full", i + 1 < step ? "bg-primary" : i + 1 === step ? "bg-lime" : "bg-border")} />
                <span className={cn("text-xs", i + 1 === step ? "font-medium" : "text-muted-foreground")}>
                  {i + 1}. {label}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </header>
      <ConnectGate>
        {doneLot !== null ? (
          <Done lotId={doneLot} onAnother={() => { setDoneLot(null); setStep(1); }} />
        ) : (
          <WizardForm step={step} setStep={setStep} onDone={(id) => setDoneLot(id ?? "")} />
        )}
      </ConnectGate>
    </PageBody>
  );
}

function WizardForm({ step, setStep, onDone }: { step: 1 | 2 | 3; setStep: (s: 1 | 2 | 3) => void; onDone: (lotId: string | null) => void }) {
  const { t } = useLocale();
  const session = useSession();
  const health = useApiHealth();
  const canUpload = !health.isError && session.signedInToApi;
  const [photos, setPhotos] = useState<EvidenceItem[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [usedLocalHashes, setUsedLocalHashes] = useState(false);
  const register = useRegisterLotMutation((lotId) => onDone(lotId));

  const form = useForm<WizardInput, unknown, WizardValues>({
    resolver: zodResolver(wizardSchema(t)),
    defaultValues: {
      plotName: "",
      region: session.profile?.region ?? "",
      areaM2: "",
      crop: "Padi",
      variety: "",
      projectedKg: "",
      harvestMonth: currentMonth(),
    },
    mode: "onTouched",
  });

  async function next() {
    if (step === 1) {
      const ready = photos.filter((p) => p.sha256);
      if (!ready.length) return setPhotoError(t("wizard.needPhoto"));
      if (!ready.some((p) => p.gps)) return setPhotoError(t("wizard.needGps"));
      setPhotoError(null);
      if (await form.trigger([...STEP_FIELDS[1]])) setStep(2);
    } else if (step === 2) {
      if (await form.trigger([...STEP_FIELDS[2]])) setStep(3);
    }
  }

  async function submit(values: WizardValues) {
    setPreparing(true);
    try {
      const ready = photos.filter((p) => p.sha256);
      const digest = await evidenceDigest(ready);
      let plotHash: string | null = null;
      let gpsHash = digest.gpsHash;
      const evidenceIds = ready.map((p) => p.evidence?.id).filter((id): id is string => Boolean(id));
      if (canUpload && digest.gps) {
        try {
          const plot = await api.createPlot({
            name: values.plotName,
            lat: digest.gps.lat,
            lng: digest.gps.lng,
            areaM2: values.areaM2,
            region: values.region,
            evidenceIds,
          });
          plotHash = plot.plotHash;
          gpsHash = plot.gpsHash;
        } catch {
          /* fall through to local hashes */
        }
      }
      if (!plotHash) {
        setUsedLocalHashes(true);
        plotHash = await sha256Hex(JSON.stringify({ name: values.plotName, areaM2: values.areaM2, region: values.region, photos: ready.map((p) => p.sha256) }));
      }
      register.mutate({
        crop: values.crop,
        variety: values.variety || null,
        region: values.region,
        projected_kg: values.projectedKg,
        harvest_month: values.harvestMonth,
        plot_hash: plotHash,
        gps_hash: gpsHash ?? plotHash,
        area_m2: values.areaM2,
        media_uri: digest.evidenceUri,
      });
    } finally {
      setPreparing(false);
    }
  }

  const busy = preparing || register.isPending;

  return (
    <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(submit)} noValidate>
      <ApiOfflineBanner />
      {step === 1 ? (
        <PlotStep form={form}>
          <EvidenceUploader items={photos} onItemsChange={setPhotos} kind="PLOT" canUpload={canUpload} max={4} />
          {photoError ? <p className="text-sm text-destructive">{photoError}</p> : null}
        </PlotStep>
      ) : step === 2 ? (
        <HarvestStep form={form} />
      ) : (
        <ReviewStep values={form.getValues()} photos={photos} />
      )}

      {step === 3 && (usedLocalHashes || !canUpload) ? (
        <Alert>
          <Info />
          <AlertDescription>{t("wizard.hashesLocal")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {step > 1 ? (
            <Button type="button" variant="ghost" size="lg" disabled={busy} onClick={() => setStep((step - 1) as 1 | 2)}>
              <ArrowLeft data-icon="inline-start" />
              {t("common.back")}
            </Button>
          ) : null}
          {step < 3 ? (
            <Button type="button" size="lg" onClick={next} disabled={photos.some((p) => p.status === "reading" || p.status === "uploading")}>
              {t("common.next")}
              <ArrowRight data-icon="inline-end" />
            </Button>
          ) : (
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? <Spinner data-icon="inline-start" /> : <Signature data-icon="inline-start" />}
              {busy ? t("wizard.signing") : t("wizard.sign")}
            </Button>
          )}
        </div>
        {step === 3 ? <TxStatusLine status={register.status} data={register.data} error={register.error} /> : null}
      </div>
    </form>
  );
}

function Done({ lotId, onAnother }: { lotId: string; onAnother: () => void }) {
  const { t } = useLocale();
  return (
    <div className="flex flex-col items-start gap-4 rounded-md border border-primary/40 bg-success/50 p-6">
      <CheckCircle aria-hidden weight="fill" className="size-10 text-primary" />
      <h2 className="text-2xl">{t("wizard.doneTitle", { lot: lotId || t("common.lot") })}</h2>
      <p className="text-ink-2">{t("wizard.doneBody")}</p>
      <div className="flex flex-wrap gap-2">
        {lotId ? (
          <Button asChild size="lg">
            <Link href={`/lot/${encodeURIComponent(lotId)}`}>{t("wizard.viewLot")}</Link>
          </Button>
        ) : (
          <Button asChild size="lg">
            <Link href="/farmer">{t("farmer.title")}</Link>
          </Button>
        )}
        <Button variant="outline" size="lg" onClick={onAnother}>
          {t("wizard.another")}
        </Button>
      </div>
    </div>
  );
}
