"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Heart, HeartCrack, Share2, Download, Trash2, Flag, User, EyeOff } from "lucide-react";
import { PaperSurface } from "../letter/PaperSurface";
import { BurnTimer } from "./BurnTimer";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { LetterRecord, OpenLetter, LetterSummary } from "@/lib/types";
import { useLocale } from "@/hooks/useLocale";
import { useToast } from "@/hooks/useToast";
import { useAccessToken } from "@/hooks/useAccessToken";
import { ReplyButton } from "./ReplyButton";
import { ThreadView } from "./ThreadView";

/** Max messages per reply thread (mirrors MAX_THREAD_DEPTH = 5 server-side). */
const MAX_THREAD_MESSAGES = 6;

export interface LetterReaderProps {
  letter: LetterRecord | OpenLetter | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (letterId: string) => Promise<void>;
  onPublish: (letterId: string) => Promise<void>;
  onReact: (letterId: string, reaction: "heart" | "heartCrack") => Promise<void>;
  onDownloadPostcard: (letter: LetterRecord | OpenLetter) => void;
  onReport: (letterId: string) => void;
  username: string;
}

export function LetterReader({
  letter,
  isOpen,
  onClose,
  onDelete,
  onPublish,
  onReact,
  onDownloadPostcard,
  onReport,
  username,
}: LetterReaderProps) {
  const { t } = useLocale();
  const { showToast } = useToast();
  const { token } = useAccessToken(username);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [thread, setThread] = useState<LetterSummary[] | null>(null);

  // Load the reply thread when a letter is opened.
  useEffect(() => {
    if (!isOpen || !letter) {
      setThread(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(
          `/api/letters/${letter.id}/thread?username=${encodeURIComponent(username.toLowerCase())}`,
          { headers }
        );
        const json = await res.json();
        if (!cancelled && json.ok && Array.isArray(json.data?.thread)) {
          setThread(json.data.thread);
        }
      } catch {
        if (!cancelled) setThread(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, letter, username, token]);

  const canReply = thread === null || thread.length < MAX_THREAD_MESSAGES;

  const readerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;

      const focusableSelector =
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

      const timer = setTimeout(() => {
        if (readerRef.current) {
          const focusables = readerRef.current.querySelectorAll<HTMLElement>(focusableSelector);
          focusables[0]?.focus();
        }
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (confirmDelete || confirmPublish) return;

        if (e.key === "Escape") {
          e.preventDefault();
          onCloseRef.current();
          return;
        }

        if (e.key === "Tab") {
          if (!readerRef.current) return;
          const focusables = Array.from(
            readerRef.current.querySelectorAll<HTMLElement>(focusableSelector)
          );
          if (focusables.length === 0) {
            e.preventDefault();
            return;
          }
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (!first || !last) return;

          if (e.shiftKey) {
            if (document.activeElement === first || !readerRef.current.contains(document.activeElement)) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last || !readerRef.current.contains(document.activeElement)) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";

      return () => {
        clearTimeout(timer);
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";
        previousActiveElement.current?.focus();
      };
    }
  }, [isOpen, confirmDelete, confirmPublish]);

  if (!isOpen || !letter) return null;

  const handleReact = async (reaction: "heart" | "heartCrack") => {
    try {
      await onReact(letter.id, reaction);
      showToast(t("reader.actionReacted"), "success");
    } catch {
      showToast(t("errors.generic"), "error");
    }
  };

  const handleDelete = async () => {
    setIsActionLoading(true);
    try {
      await onDelete(letter.id);
      setConfirmDelete(false);
      onClose();
      showToast(t("reader.deletedToast"), "success");
    } catch {
      showToast(t("errors.generic"), "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handlePublish = async () => {
    setIsActionLoading(true);
    try {
      await onPublish(letter.id);
      setConfirmPublish(false);
      showToast(t("reader.publishedToast"), "success");
    } catch (err: unknown) {
      const error = err as { message?: string };
      showToast(t(error?.message || "errors.generic"), "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <>
      <div
        ref={readerRef}
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-ink/60 backdrop-blur-sm overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reader-heading"
      >
        <div className="relative w-full max-w-2xl my-auto space-y-4">
          {/* Top Bar with BurnTimer & Attached Song banner */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 flex items-center gap-3">
              <span id="reader-heading" className="sr-only">
                {letter.senderName ? `${t("reader.fromSender")} ${letter.senderName}` : t("reader.anonymousSender")}
              </span>
              {typeof letter.burnAt === "number" && !isNaN(letter.burnAt) && letter.burnAt > 0 && (
                <BurnTimer
                  burnAt={letter.burnAt}
                  onBurned={() => {
                    onDelete(letter.id);
                    onClose();
                  }}
                />
              )}

              {letter.senderName ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-peach/60 border border-gold/50 shadow-xs text-xs text-ink font-medium">
                  <User size={13} className="text-wax" aria-hidden="true" />
                  <span>{`${t("reader.fromSender")} ${letter.senderName}`}</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface border border-edge text-[11px] text-ink-muted font-mono">
                  <EyeOff size={12} aria-hidden="true" />
                  <span>{t("reader.anonymousSender")}</span>
                </div>
              )}
            </div>

            <IconButton label="Close" onClick={onClose} size="sm" variant="secondary">
              <X size={18} strokeWidth={1.5} aria-hidden="true" />
            </IconButton>
          </div>

          {/* Paper Letter Surface */}
          <div className="overflow-hidden shadow-2xl rounded-envelope">
            <PaperSurface
              paper={letter.paper}
              stamp={letter.stamp}
              stampSeed={letter.id}
              variant="reader"
            >
              {/* Reply thread context (only when this letter is part of a thread) */}
              {thread && thread.length > 1 && (
                <div className="mb-6">
                  <ThreadView
                    thread={thread}
                    currentId={letter.id}
                    labels={{
                      title: t("reader.threadTitle"),
                      youAreHere: t("reader.threadYouAreHere"),
                      anonymousLabel: t("reader.anonymousSender"),
                    }}
                  />
                </div>
              )}

              {/* Body */}
              <div className="whitespace-pre-wrap break-words min-h-[220px]">
                {letter.body}
              </div>

              {/* Sender signature if named */}
              {letter.senderName && (
                <div className="mt-8 pt-4 text-right font-hand text-base font-bold opacity-90 italic">
                  — {letter.senderName}
                </div>
              )}

              {/* Hints */}
              {letter.hints && letter.hints.length > 0 && (
                <div className="mt-10 pt-6 border-t border-current/20 space-y-2 text-xs opacity-80">
                  <span className="font-accent uppercase tracking-widest text-[11px] block font-semibold">
                    {t("reader.hintsTitle")}
                  </span>
                  {letter.hints.map((hint, idx) => (
                    <p key={idx} className="italic">
                      • {hint}
                    </p>
                  ))}
                </div>
              )}
            </PaperSurface>
          </div>

          {/* Action Bar Beneath Letter */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface border border-edge rounded-3xl shadow-[0_12px_32px_-8px_rgba(78,59,44,0.06)]">
            {/* Left: Keepsake reactions */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleReact("heart")}
                aria-label={t("reader.actionReact")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  letter.reaction === "heart"
                    ? "bg-wax/10 border-wax/40 text-wax"
                    : "border-transparent text-ink-muted hover:text-ink hover:bg-peach/30"
                }`}
                title={t("reader.actionReact")}
              >
                <Heart
                  size={16}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className={letter.reaction === "heart" ? "fill-wax" : ""}
                />
                <span>{letter.reaction === "heart" ? t("reader.actionReacted") : t("reader.actionReact")}</span>
              </button>

              <button
                type="button"
                onClick={() => handleReact("heartCrack")}
                aria-label="Heartbreak reaction"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  letter.reaction === "heartCrack"
                    ? "bg-wax/10 border-wax/40 text-wax"
                    : "border-transparent text-ink-muted hover:text-ink hover:bg-peach/30"
                }`}
                title="Heartbreak"
              >
                <HeartCrack
                  size={16}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className={letter.reaction === "heartCrack" ? "fill-wax" : ""}
                />
              </button>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1.5">
              <IconButton
                label={t("reader.actionPostcard")}
                onClick={() => onDownloadPostcard(letter)}
                size="sm"
                variant="ghost"
              >
                <Download size={18} strokeWidth={1.5} aria-hidden="true" />
              </IconButton>

              {!letter.burnAfterReading && !letter.published && (
                <IconButton
                  data-testid="publish-to-feed-btn"
                  label={t("reader.actionPublish")}
                  onClick={() => setConfirmPublish(true)}
                  size="sm"
                  variant="ghost"
                >
                  <Share2 size={18} strokeWidth={1.5} aria-hidden="true" />
                </IconButton>
              )}

              {canReply && (
                <ReplyButton
                  username={username}
                  letterId={letter.id}
                  label={t("reader.actionReply")}
                />
              )}

              <IconButton
                label={t("reader.actionReport")}
                onClick={() => onReport(letter.id)}
                size="sm"
                variant="ghost"
              >
                <Flag size={18} strokeWidth={1.5} aria-hidden="true" />
              </IconButton>

              <IconButton
                label={t("reader.actionDelete")}
                onClick={() => setConfirmDelete(true)}
                size="sm"
                variant="danger"
              >
                <Trash2 size={18} strokeWidth={1.5} aria-hidden="true" />
              </IconButton>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t("reader.confirmDeleteTitle")}
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            {t("reader.confirmDeleteDesc")}
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={isActionLoading}
              className="rounded-full"
            >
              {t("reader.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              isLoading={isActionLoading}
              className="rounded-full"
            >
              {t("reader.confirmDeleteBtn")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Publish Confirmation Modal */}
      <Modal
        isOpen={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        title={t("reader.confirmPublishTitle")}
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted leading-relaxed">
            {t("reader.confirmPublishDesc")}
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setConfirmPublish(false)}
              disabled={isActionLoading}
              className="rounded-full"
            >
              {t("reader.cancel")}
            </Button>
            <Button
              data-testid="confirm-publish-btn"
              variant="primary"
              onClick={handlePublish}
              isLoading={isActionLoading}
              className="rounded-full"
            >
              {t("reader.confirmPublishBtn")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
