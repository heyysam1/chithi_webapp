"use client";

import React, { useEffect } from "react";
import { Clock } from "lucide-react";
import { useCountdown } from "@/hooks/useCountdown";
import { useLocale } from "@/hooks/useLocale";

export interface CountdownBannerProps {
  expiresAt: number; // epoch ms
  onExpired?: () => void;
}

export function CountdownBanner({ expiresAt, onExpired }: CountdownBannerProps) {
  const { t } = useLocale();
  const { formatted, isExpired, isWarn, isDanger } = useCountdown(expiresAt);

  // Coarse announcement state (updated at minute intervals rather than every second)
  const [coarseAnnouncement, setCoarseAnnouncement] = React.useState<string>("");

  useEffect(() => {
    if (isExpired) {
      setCoarseAnnouncement(t("inbox.countdown.expired") || "Session expired");
      if (onExpired) onExpired();
      return;
    }

    const updateCoarseText = () => {
      const msLeft = Math.max(0, expiresAt - Date.now());
      if (msLeft <= 0) {
        setCoarseAnnouncement(t("inbox.countdown.expired") || "Session expired");
        return;
      }
      const totalMinutes = Math.ceil(msLeft / 60000);
      const totalHours = Math.floor(totalMinutes / 60);
      const remMinutes = totalMinutes % 60;

      if (totalHours > 0) {
        setCoarseAnnouncement(
          t("inbox.countdown.hoursRemaining", { h: totalHours, m: remMinutes })
        );
      } else if (totalMinutes === 1) {
        setCoarseAnnouncement(t("inbox.countdown.minuteRemaining"));
      } else {
        setCoarseAnnouncement(
          t("inbox.countdown.minutesRemaining", { count: totalMinutes })
        );
      }
    };

    updateCoarseText();
    const interval = setInterval(updateCoarseText, 30000);
    return () => clearInterval(interval);
  }, [expiresAt, isExpired, onExpired, t]);

  // Color state styling matching warm vintage stationery
  const bgClass = isDanger
    ? "bg-danger-surface border-danger-edge text-danger"
    : isWarn
    ? "bg-warn-surface border-warn text-warn"
    : "bg-peach/60 border-edge text-ink";

  return (
    <div
      className={`w-full px-5 py-3.5 border rounded-2xl flex flex-wrap items-center justify-between gap-3 select-none shadow-sm ${bgClass}`}
    >
      {/* Screen-reader coarse live region */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {coarseAnnouncement}
      </span>

      {/* Visual countdown display */}
      <div aria-hidden="true" className="flex items-center gap-2 text-xs font-mono tracking-wider">
        <Clock size={16} strokeWidth={1.5} className="text-wax" />
        <span className="text-ink-muted">{t("inbox.countdown.label")}</span>
      </div>

      <div aria-hidden="true" className="font-serif font-bold text-base sm:text-lg tracking-wider">
        {formatted}
      </div>
    </div>
  );
}
