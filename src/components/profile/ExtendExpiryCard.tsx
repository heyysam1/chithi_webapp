"use client";

import React, { useMemo, useState } from "react";
import { Clock, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useLocale } from "@/hooks/useLocale";
import {
  EXTEND_DURATIONS,
  MAX_EXTENSIONS_PER_MAILBOX,
  PLATFORM_MAX_LIFETIME_S,
} from "@/lib/constants";
import type { ExtendDurationKey } from "@/lib/types";

export interface ExtendExpiryCardProps {
  username: string;
  expiresAt: number;
  createdAt: number;
  extensionsUsed: number;
  isPermanent: boolean;
  token: string | null;
  onExtended: (expiresAt: number, extensionsUsed: number) => void;
}

const EXTEND_KEYS = Object.keys(EXTEND_DURATIONS) as ExtendDurationKey[];

function formatExpiry(expiresAt: number, locale: string): string {
  return new Date(expiresAt).toLocaleString(
    locale === "bn" ? "bn-BD" : "en-US",
    { dateStyle: "medium", timeStyle: "short" }
  );
}

function durationLabel(key: ExtendDurationKey): string {
  const hours = EXTEND_DURATIONS[key] / 3600;
  return hours >= 24 ? `${hours / 24}d` : `${hours}h`;
}

export function ExtendExpiryCard({
  username,
  expiresAt,
  createdAt,
  extensionsUsed,
  isPermanent,
  token,
  onExtended,
}: ExtendExpiryCardProps) {
  const { t, locale } = useLocale();

  const [selected, setSelected] = useState<ExtendDurationKey>("24h");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{
    expiresAt: number;
    extensionsRemaining: number;
  } | null>(null);

  const maxLifetimeAt = createdAt + PLATFORM_MAX_LIFETIME_S * 1000;
  const previewExpiresAt = useMemo(
    () =>
      Math.min(expiresAt + EXTEND_DURATIONS[selected] * 1000, maxLifetimeAt),
    [expiresAt, selected, maxLifetimeAt]
  );

  // Hide silently when not eligible: permanent mailboxes, the lifetime cap
  // already used, or the mailbox already sits at the platform ceiling.
  const eligible =
    !isPermanent &&
    extensionsUsed < MAX_EXTENSIONS_PER_MAILBOX &&
    expiresAt < maxLifetimeAt;

  const handleConfirm = async () => {
    setIsExtending(true);
    setErrorMsg(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch(
        `/api/mailbox/extend?username=${encodeURIComponent(
          username.toLowerCase()
        )}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ durationKey: selected }),
        }
      );
      const json = await res.json();
      if (json.ok) {
        setResult({
          expiresAt: json.data.expiresAt,
          extensionsRemaining: json.data.extensionsRemaining,
        });
        setConfirmOpen(false);
        setSuccessOpen(true);
        onExtended(json.data.expiresAt, json.data.extensionsUsed);
      } else {
        setErrorMsg(t(json.error?.message || "errors.generic"));
      }
    } catch {
      setErrorMsg(t("errors.generic"));
    } finally {
      setIsExtending(false);
    }
  };

  if (!eligible) return null;

  return (
    <>
      <div className="relative p-6 sm:p-7 rounded-3xl bg-surface border border-edge shadow-xl space-y-4 overflow-hidden transition-colors">
        <div className="absolute -top-2 left-10 w-24 h-5 washi-tape-sage rounded-sm pointer-events-none" />

        <div className="space-y-1">
          <h3 className="text-base font-serif font-bold text-ink flex items-center gap-2">
            <Hourglass size={16} strokeWidth={1.5} className="text-wax" />
            <span>{t("profile.extend.title")}</span>
          </h3>
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-mono uppercase tracking-wider text-ink-muted">
            {t("profile.extend.selectLabel")}
          </span>
          <div className="grid grid-cols-4 gap-2">
            {EXTEND_KEYS.map((key) => {
              const isSelected = selected === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(key)}
                  className={`py-2 px-1 text-center font-mono text-xs rounded-xl border transition-all select-none cursor-pointer ${
                    isSelected
                      ? "bg-peach border-peach-hover text-peach-text ring-1 ring-peach-hover font-bold shadow-sm"
                      : "bg-surface border-edge text-ink-muted hover:text-ink hover:border-peach-hover"
                  }`}
                >
                  {durationLabel(key)}
                </button>
              );
            })}
          </div>
        </div>

        {errorMsg && (
          <p role="alert" className="text-xs text-danger leading-relaxed">
            {errorMsg}
          </p>
        )}

        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => {
            setErrorMsg(null);
            setConfirmOpen(true);
          }}
          className="w-full rounded-full gap-2 font-semibold"
        >
          <Hourglass size={16} strokeWidth={1.5} />
          <span>{t("profile.extend.extendBtn")}</span>
        </Button>
      </div>

      {/* Confirm Modal */}
      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("profile.extend.confirmTitle")}
        maxWidth="max-w-md"
      >
        <div className="space-y-5">
          <p className="text-sm text-ink-muted leading-relaxed">
            {t("profile.extend.confirmDesc", {
              date: formatExpiry(previewExpiresAt, locale),
            })}
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setConfirmOpen(false)}
              className="rounded-full border-edge text-ink-muted cursor-pointer"
            >
              {t("profile.actions.cancelBtn")}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              isLoading={isExtending}
              onClick={handleConfirm}
              className="rounded-full cursor-pointer"
            >
              {t("profile.extend.confirmYes")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Success Modal */}
      <Modal
        isOpen={successOpen}
        onClose={() => setSuccessOpen(false)}
        title={t("profile.extend.successTitle")}
        maxWidth="max-w-md"
      >
        <div className="space-y-3 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-success-surface border border-success-edge flex items-center justify-center text-success shadow-sm">
            <Clock size={22} strokeWidth={1.5} />
          </div>
          <p className="text-sm text-ink leading-relaxed">
            {result
              ? t("profile.extend.successDesc", {
                  date: formatExpiry(result.expiresAt, locale),
                })
              : null}
          </p>
          {result && (
            <p className="text-[11px] text-ink-muted leading-relaxed">
              {result.extensionsRemaining === 1
                ? t("profile.extend.remainingOne")
                : t("profile.extend.remainingMany", {
                    count: result.extensionsRemaining,
                  })}
            </p>
          )}
          <div className="pt-1">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => setSuccessOpen(false)}
              className="w-full rounded-full cursor-pointer"
            >
              {t("profile.extend.closeBtn")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
