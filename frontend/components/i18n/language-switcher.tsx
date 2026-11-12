"use client";

import { Globe } from "@phosphor-icons/react";

import { LOCALES } from "@/lib/i18n/types";
import { useLocale } from "@/providers/locale-provider";
import { cn } from "@/lib/utils";

import type { Locale } from "@/lib/i18n/types";

const LABEL: Record<Locale, string> = { en: "EN", id: "ID" };

/**
 * EN | ID toggle beside the sign-in button. Switches the dictionary live and
 * persists the choice in a cookie, so the server render already matches on
 * the next visit (no language flash).
 */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div role="group" aria-label={t("common.language")} className="flex items-center gap-0.5 rounded-sm border border-border px-1 py-0.5 print:hidden">
      <Globe aria-hidden className="mx-0.5 size-3.5 text-muted-foreground" />
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={cn(
            "rounded-xs px-1.5 py-0.5 text-xs font-medium tracking-wide transition-colors",
            locale === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {LABEL[l]}
        </button>
      ))}
    </div>
  );
}
