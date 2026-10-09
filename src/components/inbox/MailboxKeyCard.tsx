"use client";

import React from "react";
import { KeyRound, ShieldAlert } from "lucide-react";
import { CopyField } from "../ui/CopyField";
import { Button } from "../ui/Button";
import { useLocale } from "@/hooks/useLocale";

export interface MailboxKeyCardProps {
  username: string;
  recoveryPasscode?: string;
  inboxUrl?: string;
  publicUrl?: string;
  onEnterInbox?: () => void;
  isInitialCreation?: boolean;
}

export function MailboxKeyCard({
  username,
  recoveryPasscode,
  inboxUrl,
  publicUrl,
  onEnterInbox,
  isInitialCreation = false,
}: MailboxKeyCardProps) {
  const { t } = useLocale();

  const effectivePublicUrl =
    publicUrl ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/${username}`
      : `/${username}`);

  const effectiveInboxUrl =
    inboxUrl ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/inbox/${username}`
      : `/inbox/${username}`);

  return (
    <div className="w-full border border-edge rounded-3xl bg-canvas dark:bg-surface p-6 sm:p-8 space-y-6 shadow-xl relative overflow-hidden">
      <div className="absolute -top-3 right-8 w-24 h-6 washi-tape-yellow rounded-sm pointer-events-none" />

      <div className="flex items-start gap-3.5">
        <div className="w-11 h-11 rounded-2xl border border-edge flex items-center justify-center text-wax bg-peach/50 dark:bg-surface-raised shrink-0 shadow-sm">
          <KeyRound size={20} strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-xl font-serif font-bold text-ink dark:text-ink-heading">
            {t("keyCard.title")}
          </h3>
          <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">
            {t("keyCard.warning")}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Passcode only shown immediately post creation */}
        {isInitialCreation && recoveryPasscode && (
          <div className="p-4 sm:p-5 rounded-2xl border border-edge bg-peach/40 dark:bg-surface-raised space-y-2.5">
            <div className="flex items-center gap-2 text-xs text-danger font-semibold">
              <ShieldAlert size={16} strokeWidth={1.5} />
              <span>{t("keyCard.passcodeWarning")}</span>
            </div>
            <CopyField
              value={recoveryPasscode}
              label={t("keyCard.passcodeLabel")}
              isSensitive={false}
            />
          </div>
        )}

        {/* Public letter link to share */}
        <CopyField
          value={effectivePublicUrl}
          label={t("keyCard.publicLinkLabel")}
        />

        {/* Private inbox link with token */}
        {inboxUrl && (
          <CopyField
            value={effectiveInboxUrl}
            label={t("keyCard.inboxLinkLabel")}
            helperText={t("keyCard.inboxLinkHelp")}
            isSensitive={true}
          />
        )}
      </div>

      {onEnterInbox && (
        <div className="pt-2">
          <Button
            variant="primary"
            size="lg"
            className="w-full bg-peach hover:bg-peach-hover text-peach-text font-semibold border border-peach-hover shadow-sm"
            onClick={onEnterInbox}
          >
            {t("keyCard.openInbox")}
          </Button>
        </div>
      )}
    </div>
  );
}
