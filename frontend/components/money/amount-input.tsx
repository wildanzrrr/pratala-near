"use client";

import { useId } from "react";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { formatIdr, parseUsdc } from "@/lib/near/format";
import { useLocale } from "@/providers/locale-provider";

/**
 * pUSDC amount field: decimal keyboard, accepts "," or ".", shows ≈ Rp at the
 * demo rate as you type. Value stays a string; parse with parseUsdc().
 */
export function AmountInput({
  label,
  value,
  onChange,
  error,
  description,
  disabled,
  unit = "pUSDC",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  description?: string;
  disabled?: boolean;
  unit?: string;
}) {
  const { locale, t } = useLocale();
  const id = useId();
  const base = parseUsdc(value);
  return (
    <Field data-invalid={error ? true : undefined} data-disabled={disabled ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
          className="tnum font-mono"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>{unit}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      {error ? (
        <FieldError>{error}</FieldError>
      ) : (
        <FieldDescription className="tnum">
          {base ? `≈ ${formatIdr(base, locale)} (${t("common.demoRate")})` : (description ?? " ")}
        </FieldDescription>
      )}
    </Field>
  );
}
