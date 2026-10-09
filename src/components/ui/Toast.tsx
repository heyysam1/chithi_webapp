"use client";

import React from "react";
import { useToast } from "@/hooks/useToast";
import { useLocale } from "@/hooks/useLocale";
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from "lucide-react";

export function ToastViewport() {
  const { toasts, removeToast, pauseToast, resumeToast } = useToast();
  const { t } = useLocale();

  // The live region is always rendered so screen readers reliably announce
  // toasts; only the toast list itself is conditional.
  return (
    <div
      className="fixed inset-x-4 bottom-4 sm:inset-x-auto sm:right-4 sm:w-full sm:max-w-sm z-[70] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const icons = {
          success: <CheckCircle size={18} strokeWidth={1.25} className="text-success shrink-0" />,
          warn: <AlertTriangle size={18} strokeWidth={1.25} className="text-warn shrink-0" />,
          error: <AlertCircle size={18} strokeWidth={1.25} className="text-wax shrink-0" />,
          info: <Info size={18} strokeWidth={1.25} className="text-gold shrink-0" />,
        };

        const icon = icons[toast.type || "info"];

        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center justify-between gap-3 p-3.5 bg-surface-raised border border-edge shadow-2xl rounded-2xl text-ink text-sm"
            onMouseEnter={() => pauseToast(toast.id)}
            onMouseLeave={() => resumeToast(toast.id)}
            onFocus={() => pauseToast(toast.id)}
            onBlur={() => resumeToast(toast.id)}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {icon}
              <span className="leading-snug font-medium">{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0 text-ink-muted hover:text-ink transition-colors rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              aria-label={t("toast.close")}
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
