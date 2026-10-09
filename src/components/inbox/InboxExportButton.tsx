"use client";

import React, { useEffect, useState } from "react";
import { ExportButton } from "./ExportButton";
import { useLocale } from "@/hooks/useLocale";
import { useAccessToken } from "@/hooks/useAccessToken";
import type { ExportableLetter } from "@/lib/exportLetters";

/**
 * Fetches the owner's full letters (with bodies) once, then renders the
 * ExportButton. Mounted in the inbox toolbar actions area.
 */
export function InboxExportButton({
  username,
  mailboxName,
}: {
  username: string;
  mailboxName: string;
}) {
  const { locale, t } = useLocale();
  const { token } = useAccessToken(username);
  const [letters, setLetters] = useState<ExportableLetter[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(
          `/api/letters/export?username=${encodeURIComponent(username.toLowerCase())}`,
          { headers }
        );
        const json = await res.json();
        if (!cancelled && json.ok && Array.isArray(json.data?.letters)) {
          setLetters(json.data.letters);
        }
      } catch {
        // Export stays available with an empty list; download is disabled then.
        if (!cancelled) setLetters([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username, token]);

  if (letters === null) return null;

  return (
    <ExportButton
      letters={letters}
      username={username}
      mailboxName={mailboxName}
      locale={locale}
      labels={{
        buttonLabel: t("export.button"),
        modalTitle: t("export.title"),
        modalHint: t("export.hint"),
        emptyHint: t("export.emptyHint"),
        downloadTxt: t("export.downloadTxt"),
        printPdf: t("export.printPdf"),
        papers: {
          parchment: t("papers.parchment"),
          midnight: t("papers.midnight"),
          rose: t("papers.rose"),
          typewriter: t("papers.typewriter"),
          rainy: t("papers.rainy"),
        },
        stamps: {
          wax: t("stamps.wax"),
          topSecret: t("stamps.topSecret"),
          memory: t("stamps.memory"),
          heartbreak: t("stamps.heartbreak"),
        },
      }}
    />
  );
}
