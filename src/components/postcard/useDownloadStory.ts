"use client";

import { useState, useCallback } from "react";
import { toPng } from "html-to-image";
import { THEME_COLORS } from "@/lib/theme";
import { useToast } from "@/hooks/useToast";
import { useLocale } from "@/hooks/useLocale";

/** Waits until the story canvas has rendered the owner's handle. */
async function waitForStoryReady(
  node: HTMLElement,
  needle: string,
  timeoutMs = 4000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((node.textContent || "").includes(needle)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

export function useDownloadStory(canvasRef: React.RefObject<HTMLDivElement | null>) {
  const [isExporting, setIsExporting] = useState(false);
  const { showToast } = useToast();
  const { t } = useLocale();

  const download = useCallback(
    async (username: string) => {
      if (!canvasRef.current) {
        showToast(t("story.failed"), "error");
        return;
      }

      setIsExporting(true);
      showToast(t("story.downloading"), "info");

      try {
        if (typeof document !== "undefined" && "fonts" in document) {
          await document.fonts.ready;
        }

        const node = canvasRef.current;
        const ready = await waitForStoryReady(node, `@${username}`);
        if (!ready) {
          throw new Error("Story canvas did not render in time");
        }

        const bg = THEME_COLORS.canvas.dark;
        // First pass warms up image/font embedding; second is authoritative.
        await toPng(node, { pixelRatio: 2, cacheBust: true, backgroundColor: bg });
        await new Promise((resolve) => setTimeout(resolve, 100));
        const dataUrl = await toPng(node, {
          pixelRatio: 2,
          cacheBust: true,
          backgroundColor: bg,
        });

        const link = document.createElement("a");
        link.download = `mychithi-story-${username}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast(t("story.saved"), "success");
      } catch (err) {
        console.error("Story export error:", err);
        showToast(t("story.failed"), "error");
      } finally {
        setIsExporting(false);
      }
    },
    [canvasRef, showToast, t]
  );

  return { download, isExporting };
}
