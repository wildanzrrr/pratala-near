"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FloppyDisk } from "@phosphor-icons/react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/common/responsive-dialog";
import { parseUsdc } from "@/lib/near/format";
import { useListingMutation } from "@/hooks/mutations/use-listing-mutation";
import { useLocale } from "@/providers/locale-provider";

import type { InputListing, ListingCategory } from "@/lib/near/types";

const CATEGORIES: ListingCategory[] = ["SEED", "FERTILIZER", "SOIL", "OTHER"];

function schema(t: (k: "common.tooShort" | "common.required" | "lot.priceInvalid") => string) {
  return z.object({
    title: z.string().trim().min(3, t("common.tooShort")).max(120),
    category: z.enum(["SEED", "FERTILIZER", "SOIL", "OTHER"]),
    description: z.string().trim().min(1, t("common.required")).max(2000),
    priceUsdc: z.string().refine((v) => parseUsdc(v) !== null && parseUsdc(v) !== "0", t("lot.priceInvalid")),
    unit: z.string().trim().min(1, t("common.required")).max(32),
    stock: z.coerce.number<string>().int().min(0).max(1_000_000),
    region: z.string().trim().min(1, t("common.required")).max(120),
  });
}
type In = z.input<ReturnType<typeof schema>>;
type Out = z.output<ReturnType<typeof schema>>;

/** Create / edit a farm-input listing (API only; payments go straight to the seller in pUSDC). */
export function ListingFormDialog({ open, onOpenChange, listing }: { open: boolean; onOpenChange: (o: boolean) => void; listing: InputListing | null }) {
  const { t } = useLocale();
  const save = useListingMutation();
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(schema(t)),
    values: {
      title: listing?.title ?? "",
      category: listing?.category ?? "SEED",
      description: listing?.description ?? "",
      priceUsdc: listing?.priceUsdc ?? "",
      unit: listing?.unit ?? "",
      stock: String(listing?.stock ?? 0),
      region: listing?.region ?? "",
    },
  });
  const e = form.formState.errors;

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("supplier.formTitle")}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <form
          id="listing-form"
          className="py-2"
          noValidate
          onSubmit={form.handleSubmit((v) =>
            save.mutate(
              { id: listing?.id, body: { ...v, priceUsdc: v.priceUsdc.replace(",", ".") } },
              { onSuccess: () => onOpenChange(false) },
            ),
          )}
        >
          <FieldGroup>
            <Field data-invalid={e.title ? true : undefined}>
              <FieldLabel htmlFor="l-title">{t("supplier.fTitle")}</FieldLabel>
              <Input id="l-title" aria-invalid={Boolean(e.title)} {...form.register("title")} />
              <FieldError errors={[e.title]} />
            </Field>
            <Field>
              <FieldLabel>{t("supplier.fCategory")}</FieldLabel>
              <Controller
                control={form.control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {t(`market.categories.${c}`)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field data-invalid={e.description ? true : undefined}>
              <FieldLabel htmlFor="l-desc">{t("supplier.fDescription")}</FieldLabel>
              <Textarea id="l-desc" rows={3} aria-invalid={Boolean(e.description)} {...form.register("description")} />
              <FieldError errors={[e.description]} />
            </Field>
            <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
              <Field data-invalid={e.priceUsdc ? true : undefined}>
                <FieldLabel htmlFor="l-price">{t("supplier.fPrice")}</FieldLabel>
                <Input id="l-price" inputMode="decimal" className="tnum font-mono" aria-invalid={Boolean(e.priceUsdc)} {...form.register("priceUsdc")} />
                <FieldError errors={[e.priceUsdc]} />
              </Field>
              <Field data-invalid={e.unit ? true : undefined}>
                <FieldLabel htmlFor="l-unit">{t("supplier.fUnit")}</FieldLabel>
                <Input id="l-unit" placeholder={t("supplier.fUnitPlaceholder")} aria-invalid={Boolean(e.unit)} {...form.register("unit")} />
                <FieldError errors={[e.unit]} />
              </Field>
              <Field data-invalid={e.stock ? true : undefined}>
                <FieldLabel htmlFor="l-stock">{t("supplier.fStock")}</FieldLabel>
                <Input id="l-stock" type="number" inputMode="numeric" min={0} className="tnum" aria-invalid={Boolean(e.stock)} {...form.register("stock")} />
                <FieldError errors={[e.stock]} />
              </Field>
            </div>
            <Field data-invalid={e.region ? true : undefined}>
              <FieldLabel htmlFor="l-region">{t("supplier.fRegion")}</FieldLabel>
              <Input id="l-region" aria-invalid={Boolean(e.region)} {...form.register("region")} />
              <FieldError errors={[e.region]} />
            </Field>
          </FieldGroup>
        </form>
        <ResponsiveDialogFooter>
          <Button type="submit" form="listing-form" size="lg" disabled={save.isPending}>
            {save.isPending ? <Spinner data-icon="inline-start" /> : <FloppyDisk data-icon="inline-start" />}
            {t("common.save")}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
