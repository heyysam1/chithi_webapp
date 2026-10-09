"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Textarea";
import { useLocale } from "@/hooks/useLocale";
import { useToast } from "@/hooks/useToast";

export interface ReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: "letter" | "feed";
  targetId: string | null;
}

export function ReportDialog({
  isOpen,
  onClose,
  targetType,
  targetId,
}: ReportDialogProps) {
  const { t } = useLocale();
  const { showToast } = useToast();

  const [reason, setReason] = useState<
    "harassment" | "spam" | "doxxing" | "phishing" | "other"
  >("harassment");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Clear any stale draft whenever the dialog opens for a (new) target, so a
  // previous report's reason/note can never leak into the next report.
  useEffect(() => {
    if (isOpen) {
      setReason("harassment");
      setNote("");
      setIsSubmitting(false);
    }
  }, [isOpen, targetId]);

  if (!isOpen || !targetId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          reason,
          note: note.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (json.ok) {
        showToast(t("report.successToast"), "success");
        onClose();
        setNote("");
      } else {
        showToast(t(json.error?.message || "errors.generic"), "error");
      }
    } catch {
      showToast(t("errors.generic"), "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const reasonOptions = [
    { id: "harassment", label: t("report.reasonHarassment") },
    { id: "spam", label: t("report.reasonSpam") },
    { id: "doxxing", label: t("report.reasonDoxxing") },
    { id: "phishing", label: t("report.reasonPhishing") },
    { id: "other", label: t("report.reasonOther") },
  ] as const;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("report.dialogTitle")}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-xs text-ink-muted leading-relaxed">
          {t("report.dialogDesc")}
        </p>

        {/* Reason Selector */}
        <div className="space-y-2">
          <label className="block text-xs font-mono uppercase tracking-wider text-ink-muted">
            {t("report.reasonLabel")}
          </label>
          <div className="space-y-1.5">
            {reasonOptions.map((opt) => (
              <label
                key={opt.id}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-raised cursor-pointer border border-transparent hover:border-edge transition-colors"
              >
                <input
                  type="radio"
                  name="reportReason"
                  checked={reason === opt.id}
                  onChange={() => setReason(opt.id)}
                  className="text-wax focus:ring-wax accent-wax"
                />
                <span className="text-xs font-medium text-ink">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Note Textarea */}
        <div className="space-y-1.5">
          <label className="block text-xs font-mono uppercase tracking-wider text-ink-muted">
            {t("report.noteLabel")}
          </label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 300))}
            placeholder={t("report.notePlaceholder")}
            maxLength={300}
            className="min-h-[80px] text-xs"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-edge">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {t("report.cancel")}
          </Button>
          <Button
            type="submit"
            variant="danger"
            isLoading={isSubmitting}
          >
            {t("report.submit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
