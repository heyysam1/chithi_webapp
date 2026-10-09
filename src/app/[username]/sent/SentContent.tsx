"use client";

import React from "react";
import Link from "next/link";
import { WaxSeal } from "@/components/envelope/WaxSeal";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/hooks/useLocale";

/** Non-scheduled confirmation hero — i18n via client hook. */
export function SentHero() {
  const { t } = useLocale();
  return (
    <>
      {/* Pressed wax seal illustration */}
      <div className="flex justify-center mb-2 animate-scaleIn">
        <WaxSeal size={64} isCracked={false} />
      </div>

      <h2 className="text-2xl sm:text-3xl font-serif font-bold text-ink tracking-tight text-center">
        {t("sent.title")}
      </h2>

      <p className="text-sm text-ink-muted leading-relaxed max-w-sm mx-auto">
        {t("sent.desc")}
      </p>
    </>
  );
}

/** Confirmation actions — i18n via client hook. */
export function SentActions({ username }: { username: string }) {
  const { t } = useLocale();
  return (
    <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
      <Link href={`/${username}`} className="w-full sm:w-auto">
        <Button
          variant="outline"
          className="w-full text-ink border-edge hover:bg-canvas-subtle"
        >
          {t("sent.writeAnother")}
        </Button>
      </Link>

      <Link href="/" className="w-full sm:w-auto">
        <Button variant="primary" className="w-full">
          {t("sent.createOwn")}
        </Button>
      </Link>
    </div>
  );
}
