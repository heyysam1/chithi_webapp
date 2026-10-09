"use client";

import React from "react";
import { Mail } from "lucide-react";
import type { LetterSummary } from "@/lib/types";
import { truncateSnippet } from "@/lib/thread";

/**
 * A thread item is a letter summary plus the (optional) body the thread
 * endpoint includes for rendering a preview snippet.
 */
export type ThreadItem = LetterSummary & { body?: string };

export interface ThreadViewLabels {
  /** Section heading, e.g. "Reply thread". */
  title: string;
  /** Badge on the currently-open letter, e.g. "You are here". */
  youAreHere?: string;
  /** Fallback name for anonymous senders, e.g. "Anonymous". */
  anonymousLabel?: string;
}

export interface ThreadViewProps {
  /** Reply chain, oldest → newest (as returned by GET /api/letters/[id]/thread). */
  thread: ThreadItem[];
  /** Id of the letter currently open in the reader. */
  currentId: string;
  /** All user-visible strings (no i18n inside this component). */
  labels: ThreadViewLabels;
  /** Called when a thread item is clicked. */
  onSelect?: (id: string) => void;
}

function formatThreadDate(createdAt: number): string {
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Vertical timeline of a letter's reply chain, in the envelope/letter
 * visual theme (serif, paper tones, wax-seal markers).
 * Renders nothing for an empty thread.
 */
export function ThreadView({ thread, currentId, labels, onSelect }: ThreadViewProps) {
  if (!thread || thread.length === 0) return null;

  return (
    <section aria-label={labels.title} className="space-y-3">
      <h3 className="font-serif text-base font-bold text-ink">{labels.title}</h3>

      <ol className="relative space-y-3 before:absolute before:left-[7px] before:top-3 before:bottom-3 before:w-px before:bg-edge">
        {thread.map((item) => {
          const isCurrent = item.id === currentId;
          const snippet = truncateSnippet(item.body);
          const senderLabel = item.senderName || labels.anonymousLabel || "Anonymous";

          return (
            <li key={item.id} className="relative pl-9">
              {/* Wax-seal timeline marker */}
              <span
                aria-hidden="true"
                className={`absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 ${
                  isCurrent
                    ? "bg-wax border-wax shadow-[0_0_0_3px_rgba(178,102,66,0.15)]"
                    : "bg-surface border-edge"
                }`}
              />

              <button
                type="button"
                onClick={() => onSelect?.(item.id)}
                aria-current={isCurrent ? "true" : undefined}
                className={`w-full text-left p-3 sm:p-4 rounded-2xl border transition-colors ${
                  isCurrent
                    ? "bg-peach/25 border-wax/50 shadow-sm"
                    : "bg-surface border-edge hover:border-wax/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
                    <Mail size={13} className="text-wax shrink-0" aria-hidden="true" />
                    <span className="truncate">{senderLabel}</span>
                  </span>
                  <span className="text-[11px] font-mono text-ink-muted shrink-0">
                    {formatThreadDate(item.createdAt)}
                  </span>
                </div>

                {snippet && (
                  <p className="mt-1.5 text-xs text-ink-muted leading-relaxed line-clamp-2">
                    {snippet}
                  </p>
                )}

                {isCurrent && labels.youAreHere && (
                  <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-wax/10 text-wax border border-wax/30">
                    {labels.youAreHere}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
