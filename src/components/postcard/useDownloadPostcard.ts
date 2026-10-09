"use client";

import { useState, useCallback } from "react";
import { toPng } from "html-to-image";
import { LetterRecord, OpenLetter } from "@/lib/types";
import { PAPERS } from "@/lib/paper";
import { useToast } from "@/hooks/useToast";
import { useLocale } from "@/hooks/useLocale";

/**
 * Waits until the off-screen canvas has actually rendered the requested
 * letter (React state updates are async, so the canvas may still show the
 * previous letter or nothing when download() is called). Polls for a snippet
 * of the letter body in the canvas text, with a hard timeout so a broken
 * canvas can never hang the export forever.
 */
async function waitForCanvasReady(
  node: HTMLElement,
  body: string,
  timeoutMs = 4000
): Promise<boolean> {
  const needle = body.trim().slice(0, 24);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const text = node.textContent || "";
    if (needle ? text.includes(needle) : text.trim().length > 0) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

export function useDownloadPostcard(canvasRef: React.RefObject<HTMLDivElement | null>) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const { t } = useLocale();

  const download = useCallback(
    async (letter: LetterRecord | OpenLetter) => {
      if (!canvasRef.current) {
        showToast(t("postcard.failed"), "error");
        return;
      }

      setIsExporting(true);
      setError(null);
      showToast(t("postcard.downloading"), "info");

      try {
        // 1. Wait for document fonts to be ready (§14.1)
        if (typeof document !== "undefined" && "fonts" in document) {
          await document.fonts.ready;
        }

        const node = canvasRef.current;
        const paperDef = PAPERS[letter.paper] || PAPERS.parchment;

        // 1b. Wait until the canvas has rendered THIS letter (not a stale or
        // empty one). Replaces the old fixed 50ms timeout at the call site.
        const ready = await waitForCanvasReady(node, letter.body);
        if (!ready) {
          throw new Error("Postcard canvas did not render in time");
        }

        // 2. First pass capture (discarded to allow web fonts to settle per §14.1)
        await toPng(node, {
          pixelRatio: 2,
          cacheBust: true,
          backgroundColor: paperDef.baseColor,
        });

        // Small delay for canvas repaint
        await new Promise((resolve) => setTimeout(resolve, 100));

        // 3. Second pass: authoritative capture at 1080x1920
        const dataUrl = await toPng(node, {
          pixelRatio: 2,
          cacheBust: true,
          backgroundColor: paperDef.baseColor,
        });

        // 4. Trigger download
        const filename = `chithi-${letter.id.slice(0, 6)}.png`;
        const link = document.createElement("a");
        link.download = filename;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast(t("postcard.saved"), "success");
      } catch (err) {
        console.error("Postcard export error:", err);
        setError("Failed to export postcard");
        showToast(t("postcard.failed"), "error");
      } finally {
        setIsExporting(false);
      }
    },
    [canvasRef, showToast, t]
  );

  return {
    download,
    isExporting,
    error,
  };
}
