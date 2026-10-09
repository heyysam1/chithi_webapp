import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicMailbox } from "@/lib/mailbox";
import { PageShell } from "@/components/layout/PageShell";
import { LetterComposer } from "@/components/letter/LetterComposer";
import { WriteLetterHeading } from "./WriteLetterHeading";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  await params;
  return {
    title: "Chithi",
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
    alternates: { canonical: null },
  };
}

export default async function PublicWriteLetterPage(props: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ replyTo?: string }>;
}) {
  const { username } = await props.params;
  const { replyTo } = await props.searchParams;

  let mailboxMeta;
  try {
    mailboxMeta = await getPublicMailbox(username);
  } catch {
    notFound();
  }

  if (!mailboxMeta || !mailboxMeta.exists) {
    notFound();
  }

  return (
    <PageShell>
      <div className="space-y-8 pb-36 sm:pb-44">
        {/* Recipient Header Banner */}
        <div className="border-b border-edge pb-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <WriteLetterHeading username={mailboxMeta.username} />
          </div>
        </div>

        {/* Letter Composer */}
        <LetterComposer
          recipientUsername={mailboxMeta.username}
          // getPublicMailbox exposes the mailbox expiry; the capsule lock
          // option in AdvancedModePanel is gated on this prop. Read
          // defensively so the page compiles whether or not the field is
          // present on the return type yet.
          mailboxExpiresAt={
            (mailboxMeta as unknown as { expiresAt?: number }).expiresAt
          }
          // Thread replies arrive via ?replyTo=<letterId>. The ID is validated
          // server-side in sendLetter(); the composer only echoes it back.
          replyToId={replyTo}
        />
      </div>
    </PageShell>
  );
}
