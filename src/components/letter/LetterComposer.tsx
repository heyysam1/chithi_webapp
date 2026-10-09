"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PaperPicker } from "./PaperPicker";
import { StampPicker } from "./StampPicker";
import { FontPicker } from "./FontPicker";
import { HintFields } from "./HintFields";
import { AdvancedModePanel, AdvancedModeState, toLocalDateTimeInputValue } from "./AdvancedModePanel";
import { LetterPreview } from "./LetterPreview";
import { CharCounter } from "./CharCounter";
import { Button } from "../ui/Button";
import { Toggle } from "../ui/Toggle";
import { PaperStyleId, StampId, FontId } from "@/lib/types";
import { LETTER_BODY_MAX } from "@/lib/constants";
import { countGraphemes } from "@/lib/sanitize";
import { useToast } from "@/hooks/useToast";
import { useLocale } from "@/hooks/useLocale";
import { useSession } from "@/hooks/useSession";
import { useLetterDraft } from "@/hooks/useLetterDraft";
import { DraftBanner } from "./DraftBanner";
import { User, EyeOff, Mailbox, Clock, X } from "lucide-react";

export interface LetterComposerProps {
  recipientUsername?: string;
  isBottleMode?: boolean;
  mailboxExpiresAt?: number;
  /** Letter ID (same recipient mailbox) this letter replies to. */
  replyToId?: string;
}

export function LetterComposer({
  recipientUsername,
  isBottleMode = false,
  mailboxExpiresAt,
  replyToId,
}: LetterComposerProps) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { showToast } = useToast();

  const [paper, setPaper] = useState<PaperStyleId>("parchment");
  const [stamp, setStamp] = useState<StampId>("wax");
  const [font, setFont] = useState<FontId>("handwriting1");
  const [body, setBody] = useState("");
  // Grapheme count is the single source of truth for length everywhere
  // (CharCounter, inline counters, submit validation, and the server).
  const graphemeCount = countGraphemes(body);
  const [hints, setHints] = useState<string[]>([""]);
  const [bottleTarget, setBottleTarget] = useState<"anyone" | "male" | "female">("anyone");

  const [advancedState, setAdvancedState] = useState<AdvancedModeState>({
    lockKind: "none",
    unlockAt: Date.now() + 3600_000,
    riddleQuestion: "",
    riddleAnswer: "",
    burnAfterReading: false,
  });

  const [isAnonymous, setIsAnonymous] = useState(true);
  const [senderName, setSenderName] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSelfSending, setIsSelfSending] = useState(false);

  // Scheduled delivery (direct letters only)
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<number | null>(null);

  const handleScheduleChange = (isoStr: string) => {
    if (!isoStr) {
      setScheduledFor(null);
      return;
    }
    setScheduledFor(new Date(isoStr).getTime());
  };

  const { sessions, activeUsername } = useSession();

  // Draft autosave (direct letters only) — restores unsent work after reloads.
  const { draft, saveDraft, clearDraft, hasDraft } = useLetterDraft(
    isBottleMode ? undefined : recipientUsername
  );

  useEffect(() => {
    if (isBottleMode) return;
    saveDraft({
      body,
      paper,
      stamp,
      font,
      hints,
      isAnonymous,
      senderName,
      mode: {
        lockKind: advancedState.lockKind,
        unlockAt: advancedState.unlockAt,
        riddleQuestion: advancedState.riddleQuestion,
        riddleAnswer: advancedState.riddleAnswer,
        burnAfterReading: advancedState.burnAfterReading,
      },
    });
  }, [body, paper, stamp, font, hints, isAnonymous, senderName, advancedState, isBottleMode, saveDraft]);

  const handleRestoreDraft = () => {
    if (!draft) return;
    setBody(draft.body);
    setPaper(draft.paper as PaperStyleId);
    setStamp(draft.stamp as StampId);
    setFont(draft.font as FontId);
    setHints(draft.hints.length > 0 ? draft.hints : [""]);
    setIsAnonymous(draft.isAnonymous);
    setSenderName(draft.senderName);
    setAdvancedState({
      lockKind: draft.mode.lockKind,
      unlockAt: draft.mode.unlockAt,
      riddleQuestion: draft.mode.riddleQuestion,
      riddleAnswer: draft.mode.riddleAnswer,
      burnAfterReading: draft.mode.burnAfterReading,
    });
    showToast(t("draft.restored"), "success");
  };

  const handleDiscardDraft = () => {
    clearDraft();
    showToast(t("draft.discarded"), "success");
  };

  // Self-letter detection guard (§3.1, §UI-01)
  useEffect(() => {
    if (!recipientUsername || isBottleMode) return;
    const recipientLower = recipientUsername.toLowerCase();
    const isOwner =
      sessions.some((s) => s.username.toLowerCase() === recipientLower) ||
      Boolean(
        typeof window !== "undefined" &&
          localStorage.getItem(`chithi:token:${recipientLower}`)
      );
    setIsSelfSending(isOwner);
  }, [recipientUsername, isBottleMode, sessions]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!body.trim()) {
      showToast(t("errors.validation.bodyTooShort"), "warn");
      return;
    }

    if (graphemeCount > LETTER_BODY_MAX) {
      showToast(t("errors.validation.bodyTooLong"), "warn");
      return;
    }

    if (!isAnonymous && !senderName.trim()) {
      showToast(t("composer.senderNameRequired"), "warn");
      return;
    }

    // Scheduled delivery validation (direct letters only)
    let scheduledTs: number | undefined;
    if (!isBottleMode && scheduleEnabled) {
      if (!scheduledFor || scheduledFor <= Date.now() + 60_000) {
        showToast(t("composer.scheduleTooSoon"), "warn");
        return;
      }
      scheduledTs = scheduledFor;
    }

    setIsSending(true);

    try {
      const cleanHints = hints.map((h) => h.trim()).filter((h) => h.length > 0);

      let localSenderUsername =
        activeUsername ||
        (sessions.length > 0 ? sessions[0]?.username : undefined);
      if (!localSenderUsername && typeof window !== "undefined") {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith("chithi:token:")) {
            localSenderUsername = k.replace("chithi:token:", "").trim();
            break;
          }
        }
      }

      if (isBottleMode) {
        const res = await fetch("/api/bottle/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body,
            paper,
            stamp,
            hints: cleanHints,
            target: bottleTarget,
            senderName: isAnonymous ? null : (senderName.trim() || null),
            senderUsername: localSenderUsername,
            isAnonymous,
          }),
        });

        const json = await res.json();
        if (!json.ok) {
          showToast(t(json.error?.message || "errors.generic"), "error");
          setIsSending(false);
          return;
        }

        clearDraft();
        router.push("/bottle?sent=true");
      } else {
        let modePayload:
          | { kind: "none" }
          | { kind: "capsule"; unlockAt: number }
          | { kind: "riddle"; question: string; answer: string } = { kind: "none" };

        if (advancedState.lockKind === "capsule") {
          modePayload = {
            kind: "capsule",
            unlockAt: advancedState.unlockAt,
          };
        } else if (advancedState.lockKind === "riddle") {
          if (!advancedState.riddleQuestion.trim() || !advancedState.riddleAnswer.trim()) {
            showToast(t("errors.validation.failed"), "warn");
            setIsSending(false);
            return;
          }
          modePayload = {
            kind: "riddle",
            question: advancedState.riddleQuestion.trim(),
            answer: advancedState.riddleAnswer.trim(),
          };
        }

        const res = await fetch("/api/letters/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            recipient: recipientUsername,
            body,
            paper,
            stamp,
            hints: cleanHints,
            burnAfterReading: advancedState.burnAfterReading,
            senderName: isAnonymous ? null : (senderName.trim() || null),
            isAnonymous,
            mode: modePayload,
            scheduledFor: scheduledTs ?? null,
            replyTo: replyToId || null,
          }),
        });

        const json = await res.json();
        if (!json.ok) {
          showToast(t(json.error?.message || "errors.generic"), "error");
          setIsSending(false);
          return;
        }

        clearDraft();
        router.push(
          `/${recipientUsername}/sent${
            scheduledTs ? `?scheduled=${scheduledTs}` : ""
          }`
        );
      }
    } catch {
      showToast(t("errors.generic"), "error");
      setIsSending(false);
    }
  };

  if (isSelfSending && recipientUsername) {
    return (
      <div className="max-w-xl mx-auto p-8 sm:p-10 rounded-3xl bg-canvas dark:bg-surface border border-edge shadow-xl text-center space-y-5">
        <div className="w-16 h-16 rounded-full bg-peach/60 dark:bg-surface-raised text-wax flex items-center justify-center mx-auto shadow-inner">
          <Mailbox size={32} />
        </div>
        <div className="space-y-2">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-ink">
            {t("composer.ownMailboxWarnTitle")}
          </h2>
          <p className="text-sm text-ink-muted leading-relaxed max-w-md mx-auto">
            {t("composer.ownMailboxWarnDesc")}
          </p>
        </div>
        <div className="pt-2">
          <Link
            href={`/inbox/${recipientUsername}`}
            className="inline-flex items-center gap-2 px-7 py-3 rounded-full bg-peach hover:bg-peach-hover text-peach-text font-semibold border border-peach-hover shadow-sm transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
          >
            <Mailbox size={16} className="text-wax" />
            <span>{t("composer.openMyInbox")}</span>
          </Link>
        </div>
      </div>
    );
  }

  const placeholderText =
    locale === "bn"
      ? "এখানে আপনার মনের না বলা কথাগুলো লিখুন..."
      : "Write what you could never say in daylight...";

  // Shared Sub-Components for Reusability across Breakpoints
  const TargetPreferenceCard = isBottleMode ? (
    <div className="space-y-2 p-5 border border-edge rounded-3xl bg-surface shadow-[0_12px_32px_-8px_rgba(70,48,32,0.08)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)]">
      <label className="block text-xs font-mono uppercase tracking-wider text-ink-muted">
        {t("composer.targetPreference")}
      </label>
      <div className="grid grid-cols-3 gap-2">
        {(["anyone", "male", "female"] as const).map((tgt) => (
          <button
            key={tgt}
            type="button"
            onClick={() => setBottleTarget(tgt)}
            className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all cursor-pointer ${
              bottleTarget === tgt
                ? "bg-peach border-peach-hover text-peach-text ring-1 ring-peach-hover font-bold"
                : "bg-canvas border-edge text-ink-muted hover:text-ink"
            }`}
          >
            {tgt === "anyone" && t("bottle.targetAnyone")}
            {tgt === "male" && t("bottle.targetMale")}
            {tgt === "female" && t("bottle.targetFemale")}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-ink-muted">
        {t("bottle.targetNote")}
      </p>
    </div>
  ) : null;

  const PlacementAndStyleCard = (
    <div className="space-y-6 p-6 border border-edge rounded-3xl bg-surface shadow-[0_12px_32px_-8px_rgba(70,48,32,0.08)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)]">
      <PaperPicker selected={paper} onChange={setPaper} />
      <div className="h-px bg-edge" />
      <FontPicker selected={font} onChange={setFont} />
      <div className="h-px bg-edge" />
      <StampPicker selected={stamp} onChange={setStamp} />
    </div>
  );

  const SenderHintsCard = (
    <div className="p-6 border border-edge rounded-3xl bg-surface shadow-[0_12px_32px_-8px_rgba(70,48,32,0.08)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)]">
      <HintFields hints={hints} onChange={setHints} />
    </div>
  );

  const SenderIdentityCard = (
    <div className="p-5 border border-edge rounded-3xl bg-surface shadow-[0_12px_32px_-8px_rgba(70,48,32,0.08)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)] space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User size={16} className="text-wax" />
          <span className="text-xs font-serif font-bold text-ink">
            {t("composer.senderIdentity")}
          </span>
        </div>
        <span className="text-[10px] font-mono text-ink-muted uppercase tracking-wider">
          {isAnonymous ? t("composer.anonymous") : t("composer.named")}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setIsAnonymous(true)}
          className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            isAnonymous
              ? "bg-peach border-peach-hover text-peach-text ring-1 ring-peach-hover font-bold shadow-xs"
              : "bg-canvas border-edge text-ink-muted hover:text-ink"
          }`}
        >
          <EyeOff size={13} />
          <span>{t("composer.anonymousOpt")}</span>
        </button>

        <button
          type="button"
          onClick={() => setIsAnonymous(false)}
          className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            !isAnonymous
              ? "bg-peach border-peach-hover text-peach-text ring-1 ring-peach-hover font-bold shadow-xs"
              : "bg-canvas border-edge text-ink-muted hover:text-ink"
          }`}
        >
          <User size={13} />
          <span>{t("composer.namedOpt")}</span>
        </button>
      </div>

      {!isAnonymous && (
        <div className="space-y-1.5 pt-1">
          <label className="block text-[11px] font-medium text-ink">
            {t("composer.yourNameLabel")}
          </label>
          <input
            type="text"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            maxLength={50}
            placeholder={t("composer.yourNamePlaceholder")}
            className="w-full px-3.5 py-2 text-xs rounded-xl bg-canvas border border-edge text-ink placeholder:text-ink-muted/60 focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold transition-colors"
          />
        </div>
      )}

      <p className="text-[11px] text-ink-muted leading-relaxed">
        {isAnonymous ? t("composer.anonymousDesc") : t("composer.namedDesc")}
      </p>
    </div>
  );

  // Scheduled delivery (direct letters only) — follows the card language of
  // AdvancedModePanel and the other composer cards.
  const ScheduleCard = !isBottleMode ? (
    <div className="p-5 border border-edge rounded-3xl bg-surface shadow-[0_12px_32px_-8px_rgba(70,48,32,0.08)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)] space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-wax" />
          <span className="text-xs font-serif font-bold text-ink">
            {t("composer.scheduleTitle")}
          </span>
        </div>
        <Toggle checked={scheduleEnabled} onChange={setScheduleEnabled} />
      </div>
      {scheduleEnabled && (
        <div className="space-y-2">
          <input
            type="datetime-local"
            min={toLocalDateTimeInputValue(Date.now() + 5 * 60_000)}
            max={
              mailboxExpiresAt
                ? toLocalDateTimeInputValue(mailboxExpiresAt)
                : undefined
            }
            value={scheduledFor ? toLocalDateTimeInputValue(scheduledFor) : ""}
            onChange={(e) => handleScheduleChange(e.target.value)}
            className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-canvas dark:bg-surface-raised text-ink dark:text-ink-heading rounded-xl border border-edge focus:outline-none focus:border-wax"
          />
          <p className="text-[11px] text-ink-muted leading-relaxed">
            {t("composer.scheduleDesc")}
          </p>
        </div>
      )}
    </div>
  ) : null;

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-40 overflow-x-hidden">
      {/* Reply indicator — shown when composing a reply to an existing letter */}
      {replyToId && !isBottleMode && recipientUsername && (
        <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-peach/50 border border-peach-hover/50">
          <span className="text-xs font-medium text-ink">
            {t("composer.replyingTo")}
          </span>
          <Link
            href={`/${recipientUsername}`}
            aria-label={t("composer.cancelReply")}
            className="text-ink-muted hover:text-ink transition-colors shrink-0"
          >
            <X size={16} />
          </Link>
        </div>
      )}

      {/* Unsent draft restore banner */}
      {hasDraft && !body.trim() && draft && (
        <div className="mb-4">
          <DraftBanner
            updatedAt={draft.updatedAt}
            onRestore={handleRestoreDraft}
            onDiscard={handleDiscardDraft}
            labels={{
              title: t("draft.title"),
              restore: t("draft.restore"),
              discard: t("draft.discard"),
            }}
          />
        </div>
      )}

      {/* DESKTOP & TABLET: 2-COLUMN BALANCED GRID (md: and lg:) */}
      <div className="hidden md:grid md:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left Column (md:col-span-7 flex flex-col gap-4) - Letter Canvas & Letter-Specific Content */}
        <div className="md:col-span-7 flex flex-col gap-4">
          {/* 1. Writing Paper */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-mono uppercase tracking-wider text-ink-muted flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-wax animate-pulse" />
                {t("composer.writingPaperDirect")}
              </span>
              <CharCounter text={body} maxChars={LETTER_BODY_MAX} />
            </div>

            <LetterPreview
              body={body}
              paper={paper}
              stamp={stamp}
              font={font}
              hints={hints}
              placeholder={placeholderText}
              isEditable={true}
              senderName={senderName}
              isAnonymous={isAnonymous}
              onChange={setBody}
            />

            <div className="flex items-center justify-between px-1 text-[11px] text-ink-muted italic">
              <span>{t("composer.urlWarning")}</span>
              <span>{graphemeCount > 0 ? `${graphemeCount} / ${LETTER_BODY_MAX}` : ""}</span>
            </div>
          </div>

          {/* 2. Time Capsules & Locks (Direct letters only) */}
          {!isBottleMode && (
            <AdvancedModePanel
              state={advancedState}
              onChange={setAdvancedState}
              mailboxExpiresAt={mailboxExpiresAt}
            />
          )}

          {/* 3. Scheduled delivery (Direct letters only) */}
          {ScheduleCard}
        </div>

        {/* Right Column (md:col-span-5 flex flex-col gap-4) - Customization, Identity & Delivery Settings */}
        <div className="md:col-span-5 flex flex-col gap-4">
          {/* 1. Target Preference (if bottle) */}
          {TargetPreferenceCard}

          {/* 2. Placement & Style Box (Parchment, Fonts, Stamp) */}
          {PlacementAndStyleCard}

          {/* 3. Sender Hints (Optional) */}
          {SenderHintsCard}

          {/* 4. Sender Identity (Anonymous vs Named) */}
          {SenderIdentityCard}
        </div>

        {/* Bottom Full-Width Submit CTA Button across both columns */}
        <div className="col-span-12 pt-3">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full text-base py-4 rounded-full shadow-xl hover:shadow-amber-500/10 transition-all font-semibold cursor-pointer"
            isLoading={isSending}
          >
            {isBottleMode
              ? t("bottle.sendButton")
              : scheduleEnabled
                ? t("composer.scheduleButton")
                : t("composer.sendButton")}
          </Button>
        </div>
      </div>

      {/* MOBILE: STREAMLINED SINGLE-COLUMN STACK (< md) */}
      <div className="md:hidden flex flex-col gap-5">
        {/* 1. Writing Paper */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-muted flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-wax animate-pulse" />
              {t("composer.writingPaper")}
            </span>
            <CharCounter text={body} maxChars={LETTER_BODY_MAX} />
          </div>

          <LetterPreview
            body={body}
            paper={paper}
            stamp={stamp}
            font={font}
            hints={hints}
            placeholder={placeholderText}
            isEditable={true}
            senderName={senderName}
            isAnonymous={isAnonymous}
            onChange={setBody}
          />

          <div className="flex items-center justify-between px-1 text-[11px] text-ink-muted italic">
            <span>{t("composer.urlWarning")}</span>
            <span>{graphemeCount > 0 ? `${graphemeCount} / ${LETTER_BODY_MAX}` : ""}</span>
          </div>
        </div>

        {/* 2. Target Preference */}
        {TargetPreferenceCard}

        {/* 3. Placement & Style */}
        {PlacementAndStyleCard}

        {/* 4. Sender Hints */}
        {SenderHintsCard}

        {/* 5. Sender Identity */}
        {SenderIdentityCard}

        {/* 6. Advanced Mode Panel */}
        {!isBottleMode && (
          <AdvancedModePanel
            state={advancedState}
            onChange={setAdvancedState}
            mailboxExpiresAt={mailboxExpiresAt}
          />
        )}

        {/* 6b. Scheduled delivery (Direct letters only) */}
        {ScheduleCard}

        {/* 7. Seal & Send Button (Mobile In-flow) */}
        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full text-base py-3.5 rounded-full shadow-lg cursor-pointer"
            isLoading={isSending}
          >
            {isBottleMode
              ? t("bottle.sendButton")
              : scheduleEnabled
                ? t("composer.scheduleButton")
                : t("composer.sendButton")}
          </Button>
        </div>
      </div>
    </form>
  );
}
