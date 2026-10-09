"use client";

import React, { useEffect, useMemo, useState } from "react";
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

export interface ExtendExpiryModalProps {
  isOpen: boolean;
  onClose: () => void;
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

type Step = "select" | "confirm" | "success";

export function ExtendExpiryModal({
  isOpen,
  onClose,
  username,
  expiresAt,
  createdAt,
  extensionsUsed,
  isPermanent,
  token,
  onExtended,
}: ExtendExpiryModalProps) {
  const { t, locale } = useLocale();

  const [selected, setSelected] = useState<ExtendDurationKey>("24h");
  const [step, setStep] = useState<Step>("select");
  const [isExtending, setIsExtending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{
    expiresAt: number;
    extensionsRemaining: number;
  } | null>(null);

  // Reset to the selection step whenever the modal opens.
  useEffect(() => {
    if (isOpen) {
      setStep("select");
      setErrorMsg(null);
    }
  }, [isOpen ]);

  const maxLifetimeAt = createdAt + PLATFORM_MAX_LIFETIME_S * 1000;
  const previewExpiresAt = useMemo(
    () =>
      Math.min(expiresAt + EXTEND_DURATIONS[selected] * 1000, maxLifetimeAt),
    [expiresAt, selected, maxLifetimeAt]
  );

  const eligible =
    !isPermanent &&
    extensionsUsed < MAX_EXTENSIONS_PER_MAILBOX &&
    expiresAt < maxLifetimeAt;

  if (!eligible) return null;

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
        setStep("success");
        onExtended(json.data.expiresAt, json.data.extensionsUsed);
      } else {
        setErrorMsg(t(json.error?.message || "errors.generic"));
        setStep("select");
      }
    } catch {
      setErrorMsg(t("errors.generic"));
      setStep("select");
    } finally {
      setIsExtending(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("profile.extend.title")}
      maxWidth="max-w-md"
    >
      {step === "success" && result ? (
        <div className="space-y-3 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-success-surface border border-success-edge flex items-center justify-center text-success shadow-sm">
            <Clock size={22} strokeWidth={1.5} />
          </div>
          <p className="text-sm text-ink leading-relaxed">
            {t("profile.extend.successDesc", {
              date: formatExpiry(result.expiresAt, locale),
            })}
          </p>
          <p className="text-[11px] text-ink-muted leading-relaxed">
            {result.extensionsRemaining === 1
              ? t("profile.extend.remainingOne")
              : t("profile.extend.remainingMany", {
                  count: result.extensionsRemaining,
                })}
          </p>
          <div className="pt-1">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={onClose}
              className="w-full rounded-full cursor-pointer"
            >
              {t("profile.extend.closeBtn")}
            </Button>
          </div>
        </div>
      ) : step === "confirm" ? (
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
              onClick={() => setStep("select")}
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
      ) : (
        <div className="space-y-4">
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
            onClick={() => setStep("confirm")}
            className="w-full rounded-full gap-2 font-semibold cursor-pointer"
          >
            <Hourglass size={16} strokeWidth={1.5} />
            <span>{t("profile.extend.extendBtn")}</span>
          </Button>
        </div>
      )}
    </Modal>
  );
}
