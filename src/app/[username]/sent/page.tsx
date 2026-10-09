import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { WaxSeal } from "@/components/envelope/WaxSeal";
import { Button } from "@/components/ui/Button";
import { ScheduledNotice } from "./ScheduledNotice";

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
          <>
            {/* Pressed wax seal illustration */}
            <div className="flex justify-center mb-2 animate-scaleIn">
              <WaxSeal size={64} isCracked={false} />
            </div>

            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-ink tracking-tight text-center">
              Your letter is on its way
            </h2>

            <p className="text-sm text-ink-muted leading-relaxed max-w-sm mx-auto">
              Your words have been sealed and delivered to{" "}
              <span className="text-wax font-semibold">@{username}</span>&apos;s mailbox.
              Because this is anonymous, the letter cannot be edited, recalled, or
              tracked.
            </p>
          </>
        )}

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href={`/${username}`} className="w-full sm:w-auto">
            <Button
              variant="outline"
              className="w-full text-ink border-edge hover:bg-canvas-subtle"
            >
              Write another letter
            </Button>
          </Link>

          <Link href="/" className="w-full sm:w-auto">
            <Button variant="primary" className="w-full">
              Create your own mailbox
            </Button>
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
