"use client";

import React, { useState, useEffect } from "react";
import { Clock, KeyRound, AlertTriangle } from "lucide-react";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { useCountdown } from "@/hooks/useCountdown";
import { useLocale } from "@/hooks/useLocale";
import { useReducedMotionSafe } from "@/hooks/useReducedMotionSafe";
import { toBengaliDigits } from "@/lib/time";

export interface LockedLetterGateProps {
  letterId: string;
  lockKind: "capsule" | "riddle";
  unlockAt?: number;
  riddleQuestion?: string;
  attemptsRemaining?: number;
  onUnlocked: (body: string) => void;
  username: string;
}

export function LockedLetterGate({
  letterId,
  lockKind,
  unlockAt = 0,
  riddleQuestion = "",
  attemptsRemaining = 5,
  onUnlocked,
  username,
}: LockedLetterGateProps) {
  const { locale, t } = useLocale();
  const shouldReduceMotion = useReducedMotionSafe();
  const countdown = useCountdown(unlockAt);

  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(attemptsRemaining);
  const [isAutoUnlocking, setIsAutoUnlocking] = useState(false);
  const [autoUnlockFailed, setAutoUnlockFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  // Latest onUnlocked without making it an effect dependency (the parent's
  // handler identity may change across renders).
  const onUnlockedRef = React.useRef(onUnlocked);
  onUnlockedRef.current = onUnlocked;

  // When the capsule countdown expires, revalidate against the server and
  // unlock automatically instead of leaving the user on a dead "Expired"
  // screen. Uses GET /api/letters/[id], which enforces unlockAt server-side.
  useEffect(() => {
    if (lockKind !== "capsule" || !countdown.isExpired) return;

    let cancelled = false;
    setIsAutoUnlocking(true);
    setAutoUnlockFailed(false);

    (async () => {
      try {
        const res = await fetch(
          `/api/letters/${letterId}?username=${encodeURIComponent(username)}`
        );
        const json = await res.json();
        if (cancelled) return;
        // GET /api/letters/[id] returns apiOk({ state: "open", letter }) —
        // the body lives at data.letter.body, NOT data.body (that shape
        // belongs to the POST /unlock response). Reading the wrong path
        // silently broke auto-unlock (always fell through to "Try again").
        const body =
          typeof json.data?.letter?.body === "string"
            ? json.data.letter.body
            : undefined;
        if (json.ok && body !== undefined) {
          onUnlockedRef.current(body);
          return;
        }
      } catch {
        // Network failure: fall through to the manual retry below.
      }
      if (!cancelled) {
        setIsAutoUnlocking(false);
        setAutoUnlockFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lockKind, countdown.isExpired, letterId, username, retryNonce]);

  const handleRiddleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/letters/${letterId}/unlock?username=${encodeURIComponent(username)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: answer.trim() }),
      });

      const json = await res.json();

      if (json.ok) {
        onUnlocked(json.data.body);
      } else {
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);

        if (json.error?.details?.attemptsRemaining?.[0]) {
          setAttemptsLeft(Number(json.error.details.attemptsRemaining[0]));
        } else {
          setAttemptsLeft((prev) => Math.max(0, prev - 1));
        }

        setErrorMsg(t(json.error?.message || "errors.riddleWrongAnswer"));
      }
    } catch {
      setErrorMsg(t("errors.generic"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (lockKind === "capsule") {
    return (
      <div className="flex flex-col items-center text-center p-6 sm:p-10 border border-edge rounded-3xl bg-surface shadow-[0_12px_32px_-8px_rgba(78,59,44,0.06)] max-w-md mx-auto space-y-4">
        <div className="w-12 h-12 rounded-2xl border border-gold/40 flex items-center justify-center text-wax bg-peach/50">
          <Clock size={24} strokeWidth={1.5} aria-hidden="true" />
        </div>

        <div>
          <h3 className="text-lg font-serif font-semibold text-ink">
            {t("gate.capsuleTitle")}
          </h3>
          <p className="text-xs text-ink-muted mt-1">
            {t("gate.capsuleDesc")}
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-gold/40 bg-peach/40 w-full space-y-1">
          <span className="text-xs font-mono uppercase text-ink-muted block">
            {t("gate.capsuleTimeLeft")}
          </span>
          <span className="text-2xl font-serif font-bold text-ink tracking-wide">
            {isAutoUnlocking
              ? locale === "bn"
                ? "খোলা হচ্ছে…"
                : "Unlocking…"
              : countdown.formatted}
          </span>
        </div>

        {autoUnlockFailed && (
          <Button
            type="button"
            variant="secondary"
            className="rounded-full"
            onClick={() => setRetryNonce((n) => n + 1)}
          >
            {locale === "bn" ? "আবার চেষ্টা করুন" : "Try again"}
          </Button>
        )}
      </div>
    );
  }

  // Riddle Lock UI
  const isExceeded = attemptsLeft <= 0;

  return (
    <div
      className={`flex flex-col items-center text-center p-6 sm:p-10 border border-edge rounded-3xl bg-surface shadow-[0_12px_32px_-8px_rgba(78,59,44,0.06)] max-w-md mx-auto space-y-5 transition-transform ${
        isShaking
          ? shouldReduceMotion
            ? "opacity-50"
            : "animate-shake"
          : ""
      }`}
    >
      <div className="w-12 h-12 rounded-2xl border border-gold/40 flex items-center justify-center text-wax bg-peach/50">
        <KeyRound size={24} strokeWidth={1.5} aria-hidden="true" />
      </div>

      <div>
        <h3 className="text-lg font-serif font-semibold text-ink">
          {isExceeded ? t("gate.riddleExceededTitle") : t("gate.riddleTitle")}
        </h3>
        <p className="text-xs text-ink-muted mt-1">
          {isExceeded ? t("gate.riddleExceededDesc") : t("gate.riddleDesc")}
        </p>
      </div>

      {!isExceeded && (
        <form onSubmit={handleRiddleSubmit} className="w-full space-y-4 text-left">
          {/* Riddle Question Display */}
          <div className="p-4 rounded-2xl border border-edge bg-canvas">
            <span className="text-[11px] font-mono uppercase text-wax block mb-1">
              {t("gate.riddleQuestionTitle")}
            </span>
            <p className="text-sm font-serif italic text-ink">
              &ldquo;{riddleQuestion}&rdquo;
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="riddle-answer-input" className="text-ink-muted font-medium">
                {t("gate.yourAnswer")}
              </label>
              <span className="text-[11px] text-ink-muted font-mono">
                {t("gate.riddleAttemptsLeft")}{" "}
                <span className="font-bold text-ink">
                  {locale === "bn" ? toBengaliDigits(attemptsLeft) : attemptsLeft}
                </span>
              </span>
            </div>

            <Input
              id="riddle-answer-input"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={t("gate.answerPlaceholder")}
              maxLength={60}
              required
              error={Boolean(errorMsg)}
              aria-describedby={errorMsg ? "riddle-error" : undefined}
            />
          </div>

          {errorMsg && (
            <div
              id="riddle-error"
              role="alert"
              aria-live="assertive"
              className="flex items-center gap-2 text-xs text-wax bg-wax/10 p-3 rounded-2xl border border-wax/30"
            >
              <AlertTriangle size={14} strokeWidth={1.5} aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            className="w-full rounded-full"
            isLoading={isSubmitting}
          >
            {t("gate.unlockButton")}
          </Button>
        </form>
      )}
    </div>
  );
}
