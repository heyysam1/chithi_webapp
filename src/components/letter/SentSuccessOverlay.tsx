"use client";

import React from "react";
import { motion } from "framer-motion";
import { Check, Waves } from "lucide-react";
import { WaxSeal } from "@/components/envelope/WaxSeal";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/hooks/useLocale";

export interface SentSuccessInfo {
  kind: "direct" | "bottle" | "reply";
  scheduledFor?: number | null;
}

interface SentSuccessOverlayProps {
  info: SentSuccessInfo;
  onWriteAnother: () => void;
  onHome: () => void;
  onBackToInbox?: () => void;
}

/**
 * In-place send confirmation. Replaces the old post-send navigation
 * (which felt like a page refresh wiping the composer): the letter is
 * sealed with a wax-stamp animation and the sender chooses what to do
 * next. The composer resets only when they ask for another letter.
 */
export function SentSuccessOverlay({
  info,
  onWriteAnother,
  onHome,
  onBackToInbox,
}: SentSuccessOverlayProps) {
  const { locale, t } = useLocale();
  const isBottle = info.kind === "bottle";

  const title =
    info.kind === "reply"
      ? t("sent.replyTitle")
      : isBottle
        ? t("bottle.successTitle")
        : info.scheduledFor
          ? t("sent.scheduledTitle")
          : t("sent.title");

  const desc =
    isBottle
      ? t("bottle.successDesc")
      : info.scheduledFor
        ? t("sent.scheduledDesc", {
            date: new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(info.scheduledFor)),
          })
        : t("sent.desc");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="w-full max-w-md rounded-3xl bg-surface border border-edge shadow-2xl px-6 py-9 sm:px-10 text-center relative overflow-hidden"
      >
        {/* washi tape accent, matching the bottle success card */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-5 washi-tape-skymist rounded-sm pointer-events-none" />

        {/* Seal stamp animation: the seal presses in, a soft ring
            blooms out, then a check badge pops onto its corner. */}
        <div className="relative w-20 h-20 mx-auto mb-5">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1.6, opacity: [0, 0.45, 0] }}
            transition={{ delay: 0.55, duration: 0.9, ease: "easeOut" }}
            className={`absolute inset-0 rounded-full border-2 ${
              isBottle ? "border-sky" : "border-wax"
            }`}
          />
          <motion.div
            initial={{ scale: 2.1, opacity: 0, rotate: -16 }}
            animate={{ scale: 1, opacity: 1, rotate: -8 }}
            transition={{ type: "spring", stiffness: 300, damping: 17, delay: 0.15 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {isBottle ? (
              <div className="w-[72px] h-[72px] rounded-full border border-sky/40 bg-sky/10 text-sky flex items-center justify-center shadow-lg">
                <Waves size={30} strokeWidth={1.5} />
              </div>
            ) : (
              <WaxSeal size={72} isCracked={false} />
            )}
          </motion.div>
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 15, delay: 0.6 }}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 border-2 border-surface flex items-center justify-center text-white shadow-md"
          >
            <Check size={14} strokeWidth={3} />
          </motion.span>
        </div>

        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.35 }}
          className="text-2xl sm:text-3xl font-serif font-bold text-ink tracking-tight"
        >
          {title}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.35 }}
          className="mt-3 text-sm text-ink-muted leading-relaxed max-w-sm mx-auto"
        >
          {desc}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65, duration: 0.35 }}
          className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          {info.kind === "reply" && onBackToInbox ? (
            <>
              <Button
                variant="primary"
                className="w-full sm:w-auto rounded-full"
                onClick={onBackToInbox}
              >
                {t("sent.backToInbox")}
              </Button>
              <Button
                variant="outline"
                className="w-full sm:w-auto rounded-full border-edge"
                onClick={onWriteAnother}
              >
                {t("sent.writeAnother")}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="primary"
                className="w-full sm:w-auto rounded-full"
                onClick={onWriteAnother}
              >
                {isBottle ? t("bottle.castAnother") : t("sent.writeAnother")}
              </Button>
              <Button
                variant="outline"
                className="w-full sm:w-auto rounded-full border-edge"
                onClick={onHome}
              >
                {t("nav.home")}
              </Button>
            </>
          )}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
