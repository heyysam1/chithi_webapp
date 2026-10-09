"use client";

import React from "react";
import { useLocale } from "@/hooks/useLocale";
import { toBengaliDigits } from "@/lib/time";
import { BottleToggle } from "@/components/inbox/BottleToggle";
import { Mail, Inbox, Waves } from "lucide-react";

export interface ProfileStatsGridProps {
  username: string;
  unreadCount: number;
  totalEnvelopeCount: number;
  acceptsBottles: boolean;
  onFilterChange?: (filter: "unread" | "all") => void;
}

export function ProfileStatsGrid({
  username,
  unreadCount,
  totalEnvelopeCount,
  acceptsBottles,
  onFilterChange,
}: ProfileStatsGridProps) {
  const { locale, t } = useLocale();

  const formattedUnread =
    locale === "bn" ? toBengaliDigits(unreadCount) : unreadCount;
  const formattedTotal =
    locale === "bn" ? toBengaliDigits(totalEnvelopeCount) : totalEnvelopeCount;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {/* Stat 1: Unread Envelopes (Lavender) - Directly Routes to /inbox?filter=unread */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onFilterChange?.("unread")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onFilterChange?.("unread");
          }
        }}
        className="relative p-5 sm:p-6 rounded-3xl bg-canvas dark:bg-surface border border-edge shadow-xl flex flex-col justify-between overflow-hidden cursor-pointer hover:border-wax/50 hover:bg-white/[0.03] active:scale-[0.99] transition-all duration-200 select-none group"
      >
        <div className="absolute -top-2 left-6 w-16 h-4 washi-tape-lavender rounded-sm pointer-events-none" />

        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-lavender border border-edge flex items-center justify-center text-lavender-text group-hover:scale-105 transition-transform">
            <Mail size={20} strokeWidth={1.5} />
          </div>
          {unreadCount > 0 && (
            <span className="w-2.5 h-2.5 rounded-full bg-wax animate-pulse mt-1" />
          )}
        </div>

        <div>
          <span className="text-3xl sm:text-4xl font-serif font-bold text-ink dark:text-ink-heading block tracking-tight">
            {formattedUnread}
          </span>
          <span className="text-xs sm:text-sm font-medium text-ink dark:text-ink-heading mt-1 block group-hover:text-wax transition-colors">
            {t("profile.stats.unreadTitle")}
          </span>
        </div>
      </div>

      {/* Stat 2: Total Envelopes (Sky Mist) - Directly Routes to /inbox?filter=all */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onFilterChange?.("all")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onFilterChange?.("all");
          }
        }}
        className="relative p-5 sm:p-6 rounded-3xl bg-canvas dark:bg-surface border border-edge shadow-xl flex flex-col justify-between overflow-hidden cursor-pointer hover:border-wax/50 hover:bg-white/[0.03] active:scale-[0.99] transition-all duration-200 select-none group"
      >
        <div className="absolute -top-2 left-6 w-16 h-4 washi-tape-skymist rounded-sm pointer-events-none" />

        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-skymist border border-edge flex items-center justify-center text-skymist-text group-hover:scale-105 transition-transform">
            <Inbox size={20} strokeWidth={1.5} />
          </div>
        </div>

        <div>
          <span className="text-3xl sm:text-4xl font-serif font-bold text-ink dark:text-ink-heading block tracking-tight">
            {formattedTotal}
          </span>
          <span className="text-xs sm:text-sm font-medium text-ink dark:text-ink-heading mt-1 block group-hover:text-wax transition-colors">
            {t("profile.stats.totalTitle")}
          </span>
        </div>
      </div>

      {/* Stat 3: Accept Bottles Toggle (Sage) */}
      <div className="relative p-5 sm:p-6 rounded-3xl bg-canvas dark:bg-surface border border-edge shadow-xl flex flex-col justify-between overflow-hidden transition-colors">
        <div className="absolute -top-2 left-6 w-16 h-4 washi-tape-sage rounded-sm pointer-events-none" />

        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-success-surface border border-edge flex items-center justify-center text-success">
            <Waves size={20} strokeWidth={1.5} />
          </div>
          <BottleToggle username={username} initialValue={acceptsBottles} />
        </div>

        <div>
          <span className="text-xs sm:text-sm font-medium text-ink dark:text-ink-heading mt-1 block">
            {t("profile.stats.bottleTitle")}
          </span>
        </div>
      </div>
    </div>
  );
}
