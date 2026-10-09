"use client";

import React, { useState, useId } from "react";
import { Copy, Check } from "lucide-react";
import { IconButton } from "./IconButton";
import { useToast } from "@/hooks/useToast";
import { useLocale } from "@/hooks/useLocale";

export interface CopyFieldProps {
  value: string;
  label?: string;
  helperText?: string;
  isSensitive?: boolean;
}

export function CopyField({
  value,
  label,
  helperText,
  isSensitive = false,
}: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const { showToast } = useToast();
  const { t } = useLocale();
  const fieldId = useId();

  const markCopied = () => {
    setCopied(true);
    showToast(t("keyCard.copied"), "success");
    window.setTimeout(() => setCopied(false), 2500);
  };

  const legacyCopy = (): boolean => {
    try {
      const el = document.createElement("textarea");
      el.value = value;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      markCopied();
      return;
    } catch {
      // Clipboard API unavailable (permissions / insecure context) — fall back.
    }
    if (legacyCopy()) {
      markCopied();
    } else {
      // Never report success when nothing reached the clipboard.
      showToast(t("errors.generic"), "error");
    }
  };

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label
          htmlFor={fieldId}
          className="block text-xs font-mono uppercase tracking-wider text-ink-muted"
        >
          {label}
        </label>
      )}
      <div className="relative flex items-center bg-surface-raised border border-edge rounded-xl overflow-hidden hover:border-wax transition-colors shadow-sm">
        <input
          id={fieldId}
          readOnly
          value={value}
          type={isSensitive ? "password" : "text"}
          className="w-full min-w-0 min-h-[44px] px-3.5 text-base bg-transparent text-ink font-mono focus:outline-none select-all"
        />
        <div className="pr-1.5 shrink-0">
          <IconButton
            size="sm"
            variant="ghost"
            label={copied ? "Copied" : "Copy"}
            onClick={handleCopy}
            className="text-ink-muted hover:text-ink"
          >
            {copied ? (
              <Check size={16} className="text-success" />
            ) : (
              <Copy size={16} />
            )}
          </IconButton>
        </div>
      </div>
      {helperText && (
        <p className="text-[11px] text-ink-muted leading-relaxed">
          {helperText}
        </p>
      )}</div>
  );
}
