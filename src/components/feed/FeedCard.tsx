"use client";

import React, { useEffect, useRef, useState } from "react";
import { Flag, Download } from "lucide-react";
import type { FeedItemWithViewer } from "@/lib/feed";
import { PaperSurface } from "../letter/PaperSurface";
import { ReactionButton } from "./ReactionButton";
import { IconButton } from "../ui/IconButton";
import { Modal } from "../ui/Modal";
import { PostcardCanvas } from "../postcard/PostcardCanvas";
import { useDownloadPostcard } from "../postcard/useDownloadPostcard";
import { formatRelativeTime } from "@/lib/time";
import { useLocale } from "@/hooks/useLocale";

export interface FeedCardProps {
  item: FeedItemWithViewer;
  onReact: (feedId: string, reaction: "heart" | "heartCrack") => Promise<void>;
  onReport: (feedId: string) => void;
}

export function FeedCard({ item, onReact, onReport }: FeedCardProps) {
  const { locale, t } = useLocale();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [localHearts, setLocalHearts] = useState(item.hearts);
  const [localCracks, setLocalCracks] = useState(item.heartCracks);
  const [hasReacted, setHasReacted] = useState(item.viewerHasReacted);

  // Postcard export: the off-screen canvas mounts only while an export is
  // requested; the effect fires after mount so the canvas ref is ready.
  const canvasRef = useRef<HTMLDivElement>(null);
  const { download } = useDownloadPostcard(canvasRef);
  const [exportRequested, setExportRequested] = useState(false);

  useEffect(() => {
    if (!exportRequested) return;
    let cancelled = false;
    (async () => {
      await download(item);
      if (!cancelled) setExportRequested(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportRequested]);

  const handleReactionClick = async (reaction: "heart" | "heartCrack") => {
    if (hasReacted) return;

    // Optimistic UI update
    setHasReacted(true);
    if (reaction === "heart") {
      setLocalHearts((h) => h + 1);
    } else {
      setLocalCracks((c) => c + 1);
    }

    try {
      await onReact(item.id, reaction);
    } catch {
      // Rollback on failure
      setHasReacted(false);
      if (reaction === "heart") setLocalHearts((h) => h - 1);
      else setLocalCracks((c) => c - 1);
    }
  };

  return (
    <>
      <div
        data-testid="feed-card"
        className="break-inside-avoid mb-6 rounded-3xl border border-edge bg-canvas dark:bg-surface overflow-hidden shadow-[0_12px_32px_-8px_rgba(78,59,44,0.06)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)] hover:shadow-md transition-all"
      >
        {/* Card Body - Clicking opens modal (§13) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsModalOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsModalOpen(true);
            }
          }}
          className="cursor-pointer relative overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-wax focus-visible:outline-offset-2"
        >
          <PaperSurface
            paper={item.paper}
            stamp={item.stamp}
            font={item.font}
            stampSeed={item.id}
            variant="thumb"
            className="pb-8"
          >
            <div className="line-clamp-[10] whitespace-pre-wrap break-words [mask-image:linear-gradient(to_bottom,black_80%,transparent_99%)]">
              {item.body}
            </div>
          </PaperSurface>
        </div>

        {/* Card Footer Toolbar */}
        <div className="flex items-center justify-between p-3.5 bg-surface border-t border-edge text-xs">
          {/* Reactions */}
          <div className="flex items-center gap-2">
            <ReactionButton
              type="heart"
              count={localHearts}
              hasReacted={hasReacted}
              onClick={() => handleReactionClick("heart")}
            />
            <ReactionButton
              type="heartCrack"
              count={localCracks}
              hasReacted={hasReacted}
              onClick={() => handleReactionClick("heartCrack")}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-ink-muted font-serif italic">
              {formatRelativeTime(item.createdAt, locale)}
            </span>
            <IconButton
              label={t("reader.actionPostcard")}
              onClick={() => setExportRequested(true)}
              size="sm"
              variant="ghost"
            >
              <Download size={14} strokeWidth={1.5} />
            </IconButton>
            <IconButton
              label="Report"
              onClick={() => onReport(item.id)}
              size="sm"
              variant="ghost"
            >
              <Flag size={14} strokeWidth={1.5} />
            </IconButton>
          </div>
        </div>
      </div>

      {/* Full Modal View on click per §13 */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <div className="space-y-4">
          <PaperSurface
            paper={item.paper}
            stamp={item.stamp}
            font={item.font}
            stampSeed={item.id}
            variant="reader"
          >
            <div className="whitespace-pre-wrap break-words min-h-[220px]">
              {item.body}
            </div>
          </PaperSurface>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <ReactionButton
                type="heart"
                count={localHearts}
                hasReacted={hasReacted}
                onClick={() => handleReactionClick("heart")}
              />
              <ReactionButton
                type="heartCrack"
                count={localCracks}
                hasReacted={hasReacted}
                onClick={() => handleReactionClick("heartCrack")}
              />
            </div>
            <div className="flex items-center gap-1">
              <IconButton
                label={t("reader.actionPostcard")}
                onClick={() => setExportRequested(true)}
                size="sm"
                variant="ghost"
              >
                <Download size={16} strokeWidth={1.25} />
              </IconButton>
              <IconButton
                label="Report"
                onClick={() => {
                  setIsModalOpen(false);
                  onReport(item.id);
                }}
                size="sm"
                variant="ghost"
              >
                <Flag size={16} strokeWidth={1.25} />
              </IconButton>
            </div>
          </div>
        </div>
      </Modal>

      {/* Off-screen postcard canvas, mounted only during an export.
          Feed postcards carry "Benami Kham" instead of a username. */}
      {exportRequested && (
        <PostcardCanvas
          letter={item}
          canvasRef={canvasRef}
          footerLabel="Benami Kham"
        />
      )}
    </>
  );
}
