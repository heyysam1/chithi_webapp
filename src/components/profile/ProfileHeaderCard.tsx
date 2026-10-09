"use client";

import React, { useState } from "react";
import { useCountdown } from "@/hooks/useCountdown";
import { useLocale } from "@/hooks/useLocale";
import { Clock, ShieldCheck, Sparkles, Mail } from "lucide-react";
import { ExtendExpiryModal } from "./ExtendExpiryModal";
import {
  MAX_EXTENSIONS_PER_MAILBOX,
  PLATFORM_MAX_LIFETIME_S,
  PERMANENT_EXPIRES_AT,
} from "@/lib/constants";

export interface ExtendConfig {
  createdAt: number;
  extensionsUsed: number;
  isPermanent: boolean;
  token: string | null;
  onExtended: (expiresAt: number, extensionsUsed: number) => void;
}

export interface ProfileHeaderCardProps {
  username: string;
  gender: string;
  expiresAt: number;
  extendConfig?: ExtendConfig;
}

export function ProfileHeaderCard({
  username,
  gender,
  expiresAt,
  extendConfig,
}: ProfileHeaderCardProps) {
  const { t } = useLocale();
  const countdown = useCountdown(expiresAt);
  const [extendOpen, setExtendOpen] = useState(false);

  const initial = username.charAt(0).toUpperCase();

  // The countdown box is clickable only when an extension is actually
  // available — otherwise it stays a plain display.
  const canExtend =
    !!extendConfig &&
    !extendConfig.isPermanent &&
    extendConfig.extensionsUsed < MAX_EXTENSIONS_PER_MAILBOX &&
    expiresAt < extendConfig.createdAt + PLATFORM_MAX_LIFETIME_S * 1000;

  // Gender label mapping using i18n
  const genderLabel =
    gender === "male"
      ? t("home.genderOptions.male")
      : gender === "female"
      ? t("home.genderOptions.female")
      : gender === "other"
      ? t("home.genderOptions.other")
      : null;

  return (
    <div className="relative p-5 sm:p-6 rounded-3xl bg-canvas dark:bg-surface border border-edge shadow-xl overflow-hidden transition-colors">
      {/* Whimsical Washi Tape Accent at Top Right */}
      <div className="absolute -top-3 right-8 w-24 h-6 washi-tape-lavender rotate-2 rounded-sm pointer-events-none z-10" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
        {/* Monogram + Identity Details */}
        <div className="flex items-center gap-4 sm:gap-5">
          {/* Scrapbook Monogram Avatar with Postal Perforation Border */}
          <div className="relative shrink-0">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-peach/50 dark:bg-surface-raised border-2 border-dashed border-wax/60 flex items-center justify-center text-wax font-serif font-bold text-xl sm:text-2xl shadow-sm rotate-[-2deg]">
              {initial}
            </div>
            {/* Tiny Postal Stamp Corner Badge */}
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-wax text-white flex items-center justify-center shadow-sm">
              <Mail size={10} strokeWidth={2} />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-serif font-bold text-ink dark:text-ink-heading tracking-tight">
                @{username}
              </h1>

              {genderLabel && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-lavender text-lavender-text border border-edge">
                  {genderLabel}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-success-surface text-success border border-edge">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                <span>{t("profile.statusActive")}</span>
              </span>

              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-ink-muted">
                <ShieldCheck size={13} className="text-success" />
                <span>{t("profile.activeSession")}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Redesigned Countdown Box with Explicit Dimensions.
            Clickable when an extension is available — opens the extend
            dialog. Visually identical either way. */}
        {(() => {
          const boxClass =
            "w-full sm:w-[300px] md:w-[320px] min-h-[100px] sm:min-h-[110px] flex flex-col items-center justify-center text-center p-4 sm:p-5 rounded-2xl bg-peach/40 border border-wax/30 dark:bg-black/40 dark:border-white/10 shadow-xl backdrop-blur-md self-center";
          const isInfinite = expiresAt >= PERMANENT_EXPIRES_AT;
          const inner = (
            <>
              <div className="text-xs font-mono uppercase tracking-widest text-ink-muted dark:text-stone-400 flex items-center justify-center gap-1.5">
                <Clock size={14} className="text-wax" />
                <span>{t("profile.timeLeft")}</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold font-mono tracking-wider text-wax-dim dark:text-amber-200/95 leading-none my-1.5">
                {isInfinite ? (
                  <span>{t("profile.infinite")}</span>
                ) : countdown.isExpired ? (
                  <span className="text-danger">{t("profile.statusExpired")}</span>
                ) : (
                  countdown.formatted
                )}
              </div>
              {!isInfinite && (
                <div className="text-xs text-ink-muted dark:text-stone-400 flex items-center justify-center gap-1 mt-0.5">
                  <Sparkles size={11} className="text-wax" />
                  <span>{t("profile.expiresIn")} {countdown.formatted}</span>
                </div>
              )}
            </>
          );
          return canExtend ? (
            <button
              type="button"
              onClick={() => setExtendOpen(true)}
              aria-haspopup="dialog"
              className={`${boxClass} cursor-pointer`}
            >
              {inner}
            </button>
          ) : (
            <div className={boxClass}>{inner}</div>
          );
        })()}
      </div>

      {canExtend && extendConfig && (
        <ExtendExpiryModal
          isOpen={extendOpen}
          onClose={() => setExtendOpen(false)}
          username={username}
          expiresAt={expiresAt}
          createdAt={extendConfig.createdAt}
          extensionsUsed={extendConfig.extensionsUsed}
          isPermanent={extendConfig.isPermanent}
          token={extendConfig.token}
          onExtended={extendConfig.onExtended}
        />
      )}
    </div>
  );
}
