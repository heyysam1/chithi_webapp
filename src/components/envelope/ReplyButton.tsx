"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Reply } from "lucide-react";
import { Button } from "../ui/Button";

export interface ReplyButtonProps {
  /** Recipient mailbox username (the letter's owner). */
  username: string;
  /** Id of the letter being replied to. */
  letterId: string;
  /** Button label text (passed in by the parent — no i18n inside this component). */
  label: string;
}

/**
 * Site-themed reply button. Navigates to the recipient's write page with
 * ?replyTo=<letterId> so the composer can pre-link the reply.
 */
export function ReplyButton({ username, letterId, label }: ReplyButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(
      `/${encodeURIComponent(username)}?replyTo=${encodeURIComponent(letterId)}`
    );
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className="rounded-full gap-1.5"
      aria-label={label}
    >
      <Reply size={16} strokeWidth={1.5} aria-hidden="true" />
      <span>{label}</span>
    </Button>
  );
}
