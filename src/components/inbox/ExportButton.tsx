"use client";

import React, { useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  buildExportFilename,
  downloadTextFile,
  formatLettersAsText,
  type ExportableLetter,
  type ExportButtonLabels,
} from "@/lib/exportLetters";
import type { Locale } from "@/lib/types";

export interface ExportButtonProps {
  /** Letters to export — each must include its full `body`. */
  letters: ExportableLetter[];
  username: string;
  mailboxName: string;
  locale?: Locale;
  labels: ExportButtonLabels;
}

/**
 * Opens a small modal with two export options:
 * "Download as .txt" and "Print / Save as PDF" (window.print()).
 * All user-visible strings come via the `labels` prop — no i18n imports here.
 */
export function ExportButton({
  letters,
  username,
  mailboxName,
  locale = "en",
  labels,
}: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const handleDownload = () => {
    if (letters.length === 0) return;
    setIsBusy(true);
    try {
      const text = formatLettersAsText(letters, {
        mailboxName,
        username,
        locale,
        paperNames: labels.papers,
        stampNames: labels.stamps,
      });
      downloadTextFile(buildExportFilename(username), text);
    } finally {
      setIsBusy(false);
      setIsOpen(false);
    }
  };

  const handlePrint = () => {
    setIsOpen(false);
    // Let the modal unmount before the print dialog captures the page.
    window.setTimeout(() => window.print(), 120);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 rounded-full"
        onClick={() => setIsOpen(true)}
      >
        <Download size={15} strokeWidth={1.5} aria-hidden="true" />
        <span>{labels.buttonLabel}</span>
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={labels.modalTitle}
        maxWidth="max-w-sm"
      >
        <div className="space-y-3">
          {labels.modalHint && (
            <p className="text-xs text-ink-muted leading-relaxed">
              {labels.modalHint}
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            className="w-full gap-2"
            onClick={handleDownload}
            disabled={isBusy || letters.length === 0}
          >
            <Download size={16} strokeWidth={1.5} aria-hidden="true" />
            <span>{labels.downloadTxt}</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full gap-2"
            onClick={handlePrint}
          >
            <Printer size={16} strokeWidth={1.5} aria-hidden="true" />
            <span>{labels.printPdf}</span>
          </Button>
        </div>
      </Modal>
    </>
  );
}
