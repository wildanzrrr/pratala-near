"use client";

import { Controller } from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CROPS, currentMonth } from "@/app/farmer/new/_components/wizard-schema";
import { formatArea, formatKg, formatMonth } from "@/lib/near/format";
import { useLocale } from "@/providers/locale-provider";

import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { EvidenceItem } from "@/components/evidence/evidence-uploader";
import type { WizardInput, WizardValues } from "@/app/farmer/new/_components/wizard-schema";

type WizardForm = UseFormReturn<WizardInput, unknown, WizardValues>;

export function PlotStep({ form, children }: { form: WizardForm; children: ReactNode }) {
  const { t } = useLocale();
  const e = form.formState.errors;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-ink-2">{t("wizard.plotLead")}</p>
        {children}
      </div>
      <FieldGroup>
        <Field data-invalid={e.plotName ? true : undefined}>
          <FieldLabel htmlFor="plotName">{t("wizard.plotName")}</FieldLabel>
          <Input id="plotName" placeholder={t("wizard.plotNamePlaceholder")} aria-invalid={Boolean(e.plotName)} {...form.register("plotName")} />
          <FieldError errors={[e.plotName]} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={e.region ? true : undefined}>
            <FieldLabel htmlFor="region">{t("wizard.region")}</FieldLabel>
            <Input id="region" placeholder={t("onboarding.regionPlaceholder")} aria-invalid={Boolean(e.region)} {...form.register("region")} />
            <FieldError errors={[e.region]} />
          </Field>
          <Field data-invalid={e.areaM2 ? true : undefined}>
            <FieldLabel htmlFor="areaM2">{t("wizard.areaM2")}</FieldLabel>
            <Input id="areaM2" type="number" inputMode="numeric" min={1} className="tnum" aria-invalid={Boolean(e.areaM2)} {...form.register("areaM2")} />
            <FieldError errors={[e.areaM2]} />
          </Field>
        </div>
      </FieldGroup>
    </div>
  );
}

export function HarvestStep({ form }: { form: WizardForm }) {
  const { t } = useLocale();
  const e = form.formState.errors;
  return (
    <FieldGroup>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field data-invalid={e.crop ? true : undefined}>
          <FieldLabel>{t("wizard.crop")}</FieldLabel>
          <Controller
            control={form.control}
            name="crop"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full" aria-invalid={Boolean(e.crop)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {CROPS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="variety">
            {t("wizard.variety")} <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
          </FieldLabel>
          <Input id="variety" placeholder={t("wizard.varietyPlaceholder")} {...form.register("variety")} />
        </Field>
        <Field data-invalid={e.projectedKg ? true : undefined}>
          <FieldLabel htmlFor="projectedKg">{t("wizard.projectedKg")}</FieldLabel>
          <Input id="projectedKg" type="number" inputMode="numeric" min={1} className="tnum" aria-invalid={Boolean(e.projectedKg)} {...form.register("projectedKg")} />
          <FieldError errors={[e.projectedKg]} />
        </Field>
        <Field data-invalid={e.harvestMonth ? true : undefined}>
          <FieldLabel htmlFor="harvestMonth">{t("wizard.harvestMonth")}</FieldLabel>
          <Input id="harvestMonth" type="month" min={currentMonth()} aria-invalid={Boolean(e.harvestMonth)} {...form.register("harvestMonth")} />
          <FieldDescription>{formatMonth(form.watch("harvestMonth") ?? "")}</FieldDescription>
          <FieldError errors={[e.harvestMonth]} />
        </Field>
      </div>
    </FieldGroup>
  );
}

export function ReviewStep({ values, photos }: { values: WizardInput; photos: EvidenceItem[] }) {
  const { t, locale } = useLocale();
  const ready = photos.filter((p) => p.sha256);
  const gps = ready.find((p) => p.gps)?.gps;
  const rows = [
    { k: t("wizard.plotName"), v: values.plotName },
    { k: t("wizard.region"), v: values.region },
    { k: t("wizard.areaM2"), v: formatArea(Number(values.areaM2), locale) },
    { k: t("wizard.crop"), v: `${values.crop}${values.variety ? ` · ${values.variety}` : ""}` },
    { k: t("wizard.projectedKg"), v: formatKg(Number(values.projectedKg), locale) },
    { k: t("wizard.harvestMonth"), v: formatMonth(values.harvestMonth, locale) },
    { k: t("evidence.gpsFromPhoto"), v: gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : "—" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-2">{t("wizard.reviewLead")}</p>
      {ready.length ? (
        <ul className="flex gap-2 overflow-x-auto">
          {ready.map((p) => (
            <li key={p.localId} className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
              <img src={p.previewUrl} alt="" className="size-20 rounded-sm object-cover" />
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="tnum grid grid-cols-1 divide-y divide-border rounded-md border border-border bg-card text-sm">
        {rows.map((r) => (
          <div key={r.k} className="flex flex-wrap justify-between gap-2 p-3">
            <dt className="text-muted-foreground">{r.k}</dt>
            <dd className="font-medium">{r.v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">{t("wizard.deposit")}</p>
    </div>
  );
}
