"use client";

import React from "react";
import { useLocale } from "@/hooks/useLocale";

/** Localized recipient heading for the public write-letter page. */
export function WriteLetterHeading({ username }: { username: string }) {
  const { t } = useLocale();
  return (
    <h1 className="text-2xl sm:text-3xl font-serif font-bold text-ink">
      {t("writeLetter.title", { username })}
    </h1>
  );
}
