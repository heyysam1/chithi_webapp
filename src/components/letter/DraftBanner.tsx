"use client";

import React from "react";
import { FileText, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "../ui/Button";

export interface DraftBannerLabels {
  /** e.g. "You have an unsent draft" */
  title: string;
  /** e.g. "Restore draft" */
  restore: string;
  /** e.g. "Discard" */
  discard: string;
}

export interface DraftBannerProps {
  /** Epoch ms of the last autosave — shown as the "saved at" line. */
  updatedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
  /** All user-visible strings; kept as props so no i18n import is needed here. */
  labels: DraftBannerLabels;
}

/**
 * Presentational banner offering to restore (or discard) an autosaved draft.
 * Purely presentational — the parent owns the draft state and the labels.
 */
export function DraftBanner({
  updatedAt,
  onRestore,
  onDiscard,
  labels,
}: DraftBannerProps) {
  const savedAt = new Date(updatedAt).toLocaleString();

  return (
    <div className="p-4 sm:p-5 rounded-2xl border border-edge bg-surface shadow-[0_12px_32px_-8px_rgba(70,48,32,0.08)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)]">
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-2xl bg-warn-surface border border-warn-edge flex items-center justify-center text-wax shrink-0"
          aria-hidden="true"
        >
          <FileText size={18} strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-sm font-serif font-bold text-ink">{labels.title}</p>
          <p className="text-[11px] font-mono text-ink-muted">{savedAt}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 pt-3">
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="rounded-full gap-1.5"
          onClick={onRestore}
        >
          <RotateCcw size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>{labels.restore}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full gap-1.5"
          onClick={onDiscard}
        >
          <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>{labels.discard}</span>
        </Button>
      </div>
    </div>
  );
}
