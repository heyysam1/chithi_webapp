import React from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { ScheduledNotice } from "./ScheduledNotice";
import { SentHero, SentActions } from "./SentContent";

export async function generateMetadata(): Promise<Metadata> {
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

export default async function LetterSentPage(props: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ scheduled?: string }>;
}) {
  const { username } = await props.params;
  const { scheduled } = await props.searchParams;

  // L-13: don't show a false confirmation on direct navigation. The composer
  // always arrives here via same-origin navigation (referer present); a typed
  // URL or external link has none (or a foreign host) — send those back to
  // the write-letter page instead.
  const headersList = await headers();
  const referer = headersList.get("referer");
  const host = headersList.get("host");
  let cameFromSelf = false;
  if (referer && host) {
    try {
      cameFromSelf = new URL(referer).host === host;
    } catch {
      cameFromSelf = false;
    }
  }
  if (!cameFromSelf) {
    redirect(`/${username}`);
  }

  // The composer redirects here with ?scheduled=<epochMs> when the letter
  // was scheduled for future delivery.
  const scheduledTs = scheduled ? Number(scheduled) : NaN;
  const isScheduled = Number.isFinite(scheduledTs) && scheduledTs > 0;

  return (
    <PageShell>
      <div className="max-w-md mx-auto py-16 text-center space-y-6">
        {isScheduled ? (
          <ScheduledNotice scheduledFor={scheduledTs} />
        ) : (
          <SentHero />
        )}

        <SentActions username={username} />
      </div>
    </PageShell>
  );
}
