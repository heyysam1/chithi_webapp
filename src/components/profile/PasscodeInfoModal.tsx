"use client";

import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/hooks/useLocale";
import { useToast } from "@/hooks/useToast";
import { readPasscode } from "@/lib/passcodeStorage";
import { Lock, Sparkles, Copy } from "lucide-react";

export interface PasscodeInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
}

export function PasscodeInfoModal({ isOpen, onClose, username }: PasscodeInfoModalProps) {
  const { t } = useLocale();
  const { showToast } = useToast();
  const [passcode, setPasscode] = useState<string | null>(null);

  // The passcode lives only in this browser (the server keeps just a
  // one-way hash). Read the persistent copy when the modal opens.
  useEffect(() => {
    if (isOpen && username) {
      setPasscode(readPasscode(username));
    } else if (!isOpen) {
      setPasscode(null);
    }
  }, [isOpen, username]);

  const handleCopy = async () => {
    if (!passcode) return;
    try {
      await navigator.clipboard.writeText(passcode);
      showToast(t("keyCard.copied"), "success");
    } catch {
      showToast(t("errors.generic"), "error");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-5 text-left p-1">
        {/* Postal Scrapbook Header Motif */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-peach/50 border border-edge flex items-center justify-center text-wax shadow-sm">
            <Lock size={22} strokeWidth={1.5} />
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted block">
              Zero-Knowledge Privacy
            </span>
            <h3 className="text-lg font-serif font-bold text-ink">
              {t("profile.passcodeModal.title")}
            </h3>
          </div>
        </div>

        {/* Security Explanation */}
        <div className="space-y-3 text-xs sm:text-sm text-ink-muted leading-relaxed">
          <p>{t("profile.passcodeModal.desc")}</p>

          {passcode ? (
            <button
              type="button"
              onClick={handleCopy}
              className="w-full p-4 rounded-2xl bg-surface border border-edge space-y-1 text-center cursor-pointer hover:border-wax transition-colors"
            >
              <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
                {t("profile.passcodeModal.passcodeLabel")}
              </div>
              <div className="font-mono text-3xl font-bold tracking-[0.35em] text-ink pl-[0.35em]">
                {passcode}
              </div>
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-ink-muted">
                <Copy size={12} />
                <span>{t("profile.passcodeModal.tapToCopy")}</span>
              </div>
            </button>
          ) : (
            <div className="p-3.5 rounded-2xl bg-surface border border-edge space-y-1.5 text-xs text-ink">
              <div className="flex items-center gap-1.5 font-medium text-wax">
                <Sparkles size={14} />
                <span>{t("profile.passcodeModal.unavailableTitle")}</span>
              </div>
              <p className="text-ink-muted leading-relaxed">
                {t("profile.passcodeModal.unavailableDesc")}
              </p>
            </div>
          )}
        </div>

        {/* Action button */}
        <div className="pt-2">
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={onClose}
            className="w-full rounded-full"
          >
            {t("profile.passcodeModal.close")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
