"use client";

import React from "react";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/hooks/useLocale";
import { DEVELOPER_PHOTO_SRC } from "@/lib/developerPhoto";

export default function AboutPage() {
  const { t } = useLocale();

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto py-8 space-y-10">
        {/* Header */}
        <div className="space-y-3 border-b border-edge pb-6 text-center">
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-ink">
            {t("about.title")}
          </h1>
          <p className="text-sm font-serif italic text-wax">
            Quiet thoughts in a noisy world.
          </p>
        </div>

        {/* Prose Chapters */}
        <div className="space-y-8 text-base leading-relaxed font-sans divide-y divide-edge">
          <div className="space-y-3 pt-2">
            <h2 className="text-lg font-serif font-semibold text-wax">
              The Philosophy
            </h2>
            <p className="text-ink-muted">{t("about.prose.p1")}</p>
          </div>

          <div className="space-y-3 pt-6">
            <h2 className="text-lg font-serif font-semibold text-wax">
              Privacy by Design
            </h2>
            <p className="text-ink-muted">{t("about.prose.p2")}</p>
          </div>

          <div className="space-y-3 pt-6">
            <h2 className="text-lg font-serif font-semibold text-wax">
              Hard Expiry &amp; Redis TTL
            </h2>
            <p className="text-ink-muted">{t("about.prose.p3")}</p>
          </div>

          <div className="space-y-3 pt-6">
            <h2 className="text-lg font-serif font-semibold text-wax">
              Message in a Bottle &amp; Plain Text
            </h2>
            <p className="text-ink-muted">{t("about.prose.p4")}</p>
          </div>

          <div className="space-y-3 pt-6">
            <h2 className="text-lg font-serif font-semibold text-wax">
              Safety &amp; Automatic Moderation
            </h2>
            <p className="text-ink-muted">{t("about.prose.p5")}</p>
          </div>
        </div>

        {/* Action Call to Action */}
        <div className="pt-8 border-t border-edge flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/" className="w-full sm:w-auto">
            <Button variant="primary" size="lg" className="w-full">
              Create Your Mailbox
            </Button>
          </Link>
          <Link href="/feed" className="w-full sm:w-auto">
            <Button variant="outline" size="lg" className="w-full">
              Explore Benami Kham
            </Button>
          </Link>
        </div>

        {/* Developer credit — intentionally small and understated */}
        <div className="pt-6 border-t border-edge flex justify-center">
          <Link
            href="/developer"
            className="flex items-center gap-2.5 text-ink-muted hover:text-ink transition-colors"
          >
            <img
              src={DEVELOPER_PHOTO_SRC}
              alt="Mohammed Sami"
              width={32}
              height={32}
              className="w-8 h-8 rounded-full object-cover border border-edge"
            />
            <span className="text-xs font-medium">Mohammed Sami</span>
            <span aria-hidden="true" className="text-xs">
              →
            </span>
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
