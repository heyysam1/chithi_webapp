"use client";

import React from "react";
import { KeyRound } from "lucide-react";
import { Button } from "../ui/Button";
import { BottleToggle } from "./BottleToggle";
import { InboxExportButton } from "./InboxExportButton";
import { useLocale } from "@/hooks/useLocale";
import { toBengaliDigits } from "@/lib/time";

export interface InboxToolbarProps {
  username: string;
  unreadCount: number;
  totalCount: number;
  acceptsBottles: boolean;
  onOpenKeys: () => void;
  activeFilter?: "all" | "unread";
  onFilterChange?: (filter: "all" | "unread") => void;
}

export function InboxToolbar({
  username,
  unreadCount,
  totalCount,
  acceptsBottles,
  onOpenKeys,
  activeFilter = "all",
  onFilterChange,
}: InboxToolbarProps) {
  const { locale, t } = useLocale();

  const formattedUnread =
    locale === "bn" ? toBengaliDigits(unreadCount) : unreadCount;
  const formattedTotal =
    locale === "bn" ? toBengaliDigits(totalCount) : totalCount;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 border border-edge rounded-3xl bg-canvas dark:bg-surface shadow-[0_12px_32px_-8px_rgba(78,59,44,0.06)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)] select-none transition-colors">
      {/* Interactive Filter Counters */}
      <div className="flex items-center gap-2 text-xs font-mono">
        <button
          type="button"
          onClick={() => onFilterChange?.("unread")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all cursor-pointer ${
            activeFilter === "unread"
              ? "bg-peach text-peach-text font-bold border border-peach-hover shadow-xs"
              : "text-ink-muted hover:text-ink dark:hover:text-ink-heading hover:bg-black/5 dark:hover:bg-white/5"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-wax animate-pulse" />
          <span className="font-bold text-sm">{formattedUnread}</span>
          <span>{t("inbox.toolbar.unread")}</span>
        </button>

        <div className="h-4 w-px bg-edge" />

        <button
          type="button"
          onClick={() => onFilterChange?.("all")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all cursor-pointer ${
            activeFilter === "all"
              ? "bg-peach text-peach-text font-bold border border-peach-hover shadow-xs"
              : "text-ink-muted hover:text-ink dark:hover:text-ink-heading hover:bg-black/5 dark:hover:bg-white/5"
          }`}
        >
          <span className="font-bold text-sm">{formattedTotal}</span>
          <span>{t("inbox.toolbar.total")}</span>
        </button>
      </div>

      {/* Actions: Export, Bottle Toggle and Keys Modal Button */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
        <InboxExportButton username={username} mailboxName={username} />

        <BottleToggle username={username} initialValue={acceptsBottles} />

        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenKeys}
          className="gap-1.5 text-xs font-mono rounded-full border-edge bg-surface text-ink hover:bg-canvas dark:hover:bg-surface-raised cursor-pointer"
        >
          <KeyRound size={14} strokeWidth={1.5} className="text-wax" />
          <span>{t("inbox.toolbar.keys")}</span>
        </Button>
      </div>
    </div>
  );
}
