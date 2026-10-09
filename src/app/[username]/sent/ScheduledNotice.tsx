"use client";

import React from "react";
import { Clock } from "lucide-react";
import { useLocale } from "@/hooks/useLocale";

/**
 * Shown on the /sent confirmation page when the letter was scheduled for
 * future delivery instead of sent immediately.
 */
export function ScheduledNotice({ scheduledFor }: { scheduledFor: number }) {
  const { locale, t } = useLocale();

  const dateStr = new Date(scheduledFor).toLocaleString(
    locale === "bn" ? "bn-BD" : "en-GB",
    { dateStyle: "medium", timeStyle: "short" }
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-center mb-2 animate-scaleIn">
        <div className="w-16 h-16 rounded-full bg-peach/60 dark:bg-surface-raised text-wax flex items-center justify-center shadow-inner">
          <Clock size={32} />
        </div>
      </div>

      <h2 className="text-2xl sm:text-3xl font-serif font-bold text-ink tracking-tight text-center">
        {t("sent.scheduledTitle")}
      </h2>

      <p className="text-sm text-ink-muted leading-relaxed max-w-sm mx-auto">
        {t("sent.scheduledDesc", { date: dateStr })}
      </p>
    </div>
  );
}
