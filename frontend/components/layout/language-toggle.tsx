"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLocale } from "@/providers/locale-provider";

import type { Locale } from "@/lib/i18n/types";

/** ID / EN switch — two options, so a toggle group, not a menu. */
export function LanguageToggle() {
  const { locale, setLocale, t } = useLocale();
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={locale}
      onValueChange={(v) => v && setLocale(v as Locale)}
      aria-label={t("common.language")}
    >
      <ToggleGroupItem value="id" aria-label="Bahasa Indonesia" className="font-mono text-xs">
        ID
      </ToggleGroupItem>
      <ToggleGroupItem value="en" aria-label="English" className="font-mono text-xs">
        EN
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
