"use client";

import React from "react";
import Link from "next/link";
import { Facebook } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { useLocale } from "@/hooks/useLocale";
import { DEVELOPER_PHOTO_SRC } from "@/lib/developerPhoto";

/**
 * Developer page — simple and clean by design.
 * The owner explicitly does not want this prominent: no "Founder" titles,
 * hobby spirit first, privacy points kept light.
 */
export default function DeveloperPage() {
  const { t } = useLocale();

  return (
    <PageShell>
      <div className="max-w-xl mx-auto py-12 text-center space-y-6">
        <img
          src={DEVELOPER_PHOTO_SRC}
          alt="Mohammed Sami"
          width={96}
          height={96}
          className="w-24 h-24 rounded-full object-cover border border-edge mx-auto"
        />
        <div className="space-y-2">
          <h1 className="text-2xl font-serif font-bold text-ink">
            Mohammed Sami
          </h1>
          <p className="text-sm font-serif italic text-wax-dim">
            {t("developer.tagline")}
          </p>
        </div>
        <p className="text-sm text-ink-muted leading-relaxed">
          {t("developer.bio")}
        </p>
        <div>
          <a
            href="https://www.facebook.com/heyy.sam1"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-edge text-sm text-ink-muted hover:text-ink hover:border-wax transition-colors"
          >
            <Facebook size={15} strokeWidth={1.5} />
            <span>Facebook</span>
          </a>
        </div>
        <div className="pt-4">
          <Link
            href="/about"
            className="text-xs text-ink-muted hover:text-ink transition-colors"
          >
            ← {t("nav.about")}
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
