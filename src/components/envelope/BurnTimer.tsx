"use client";

import React, { useState, useEffect, useRef } from "react";
import { Flame } from "lucide-react";
import { BURN_WINDOW_MS } from "@/lib/constants";
import { useLocale } from "@/hooks/useLocale";
import { toBengaliDigits } from "@/lib/time";

export interface BurnTimerProps {
  burnAt: number; // epoch ms
  onBurned: () => void;
}

export function BurnTimer({ burnAt, onBurned }: BurnTimerProps) {
  const { locale, t } = useLocale();
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, burnAt - Date.now()));
  // Guard so onBurned fires exactly once even though the interval keeps ticking.
  const burnedRef = useRef(false);

  useEffect(() => {
    // Reset for a new burn window (e.g. a different letter).
    burnedRef.current = false;

    const checkTimer = () => {
      const remaining = Math.max(0, burnAt - Date.now());
      setRemainingMs(remaining);

      if (remaining <= 0 && !burnedRef.current) {
        burnedRef.current = true;
        clearInterval(interval);
        onBurned();
      }
    };

    // Declared before first use (TDZ-safe: checkTimer only reads `interval`
    // when it actually runs, which is always after this line).
    const interval = setInterval(checkTimer, 200);
    checkTimer();

    return () => clearInterval(interval);
  }, [burnAt, onBurned]);

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const progressPercent = Math.min(100, Math.max(0, (remainingMs / BURN_WINDOW_MS) * 100));

  const displaySeconds =
    locale === "bn" ? toBengaliDigits(remainingSeconds) : remainingSeconds;

  return (
    <div className="w-full space-y-2 select-none">
      {/* Progress hairline draining across the top (§11.4) */}
      <div className="w-full h-1 bg-edge overflow-hidden rounded-full">
        <div
          className="h-full bg-wax transition-all duration-200 ease-linear"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-wax font-accent uppercase tracking-wider px-1">
        <div className="flex items-center gap-1.5 font-medium">
          <Flame size={14} strokeWidth={1.25} className="animate-pulse" />
          <span>{t("reader.burnWarning")}</span>
        </div>
        <div className="font-bold text-sm">
          {displaySeconds} {t("reader.seconds")}
        </div>
      </div>
    </div>
  );
}
