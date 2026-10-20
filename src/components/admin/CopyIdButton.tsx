"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useLocale } from "@/hooks/useLocale";
import { useToast } from "@/hooks/useToast";

/**
 * Copy-to-clipboard button for admin IDs (letter / feed / report targets).
 * IDs are long and error-prone to retype; one tap copies the exact value.
 */
export function CopyIdButton({ value }: { value: string }) {
  const { t } = useLocale();
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      showToast(t("admin.common.copied"), "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(t("admin.system.actionError"), "error");
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full border border-edge bg-surface text-ink-muted hover:text-ink shrink-0"
      aria-label={t("admin.common.copyId")}
      title={t("admin.common.copyId")}
    >
      {copied ? (
        <Check size={12} strokeWidth={2} />
      ) : (
        <Copy size={12} strokeWidth={1.5} />
      )}
      {t("admin.common.copyId")}
    </button>
  );
}
