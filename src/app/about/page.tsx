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
          <p className="text-sm font-serif italic text-wax-dim">
            {t("about.tagline")}
          </p>
        </div>

        {/* Prose Chapters */}
        <div className="space-y-8 text-base leading-relaxed font-sans divide-y divide-edge">
          <div className="space-y-3 pt-2">
            <h2 className="text-lg font-serif font-semibold text-wax-dim">
              {t("about.chapters.philosophy")}
            </h2>
            <p className="text-ink-muted">{t("about.prose.p1")}</p>
          </div>

          <div className="space-y-3 pt-6">
            <h2 className="text-lg font-serif font-semibold text-wax-dim">
              {t("about.chapters.privacy")}
            </h2>
            <p className="text-ink-muted">{t("about.prose.p2")}</p>
          </div>

          <div className="space-y-3 pt-6">
            <h2 className="text-lg font-serif font-semibold text-wax-dim">
              {t("about.chapters.expiry")}
            </h2>
            <p className="text-ink-muted">{t("about.prose.p3")}</p>
          </div>

          <div className="space-y-3 pt-6">
            <h2 className="text-lg font-serif font-semibold text-wax-dim">
              {t("about.chapters.bottle")}
            </h2>
            <p className="text-ink-muted">{t("about.prose.p4")}</p>
          </div>

          <div className="space-y-3 pt-6">
            <h2 className="text-lg font-serif font-semibold text-wax-dim">
              {t("about.chapters.safety")}
            </h2>
            <p className="text-ink-muted">{t("about.prose.p5")}</p>
          </div>
        </div>

        {/* Action Call to Action */}
        <div className="pt-8 border-t border-edge flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/" className="w-full sm:w-auto">
            <Button variant="primary" size="lg" className="w-full">
              {t("about.cta.create")}
            </Button>
          </Link>
          <Link href="/feed" className="w-full sm:w-auto">
            <Button variant="outline" size="lg" className="w-full">
              {t("about.cta.explore")}
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
            <span className="text-xs font-medium">{t("about.developerLink")}</span>
            <span aria-hidden="true" className="text-xs">
              →
            </span>
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
