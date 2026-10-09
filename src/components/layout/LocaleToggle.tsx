"use client";

import React from "react";
import { useLocale } from "@/hooks/useLocale";

export function LocaleToggle() {
  const { locale, setLocale } = useLocale();

  return (
    <div
      role="group"
      aria-label="Language selector"
      className="inline-flex items-center text-xs font-mono tracking-wider border border-edge rounded-full p-0.5 bg-surface transition-colors shadow-sm"
    >
      <button
        type="button"
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
        className={`min-h-[36px] min-w-[36px] px-2 flex items-center justify-center transition-all rounded-full select-none text-[11px] ${
          locale === "en"
            ? "bg-peach dark:bg-surface-raised text-ink dark:text-ink-heading font-bold shadow-xs"
            : "text-ink-muted hover:text-ink dark:hover:text-ink-heading"
        }`}
      >
        EN
      </button>
      <div className="w-[1px] h-3 bg-edge mx-0.5" />
      <button
        type="button"
        aria-pressed={locale === "bn"}
        onClick={() => setLocale("bn")}
        className={`min-h-[36px] min-w-[36px] px-2 flex items-center justify-center font-serif transition-all rounded-full select-none text-[11px] ${
          locale === "bn"
            ? "bg-peach dark:bg-surface-raised text-ink dark:text-ink-heading font-bold shadow-xs"
            : "text-ink-muted hover:text-ink dark:hover:text-ink-heading"
        }`}
      >
        বাং
      </button>
    </div>
  );
}
