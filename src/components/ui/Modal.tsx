"use client";

import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  /** Accessible name for modals without a visible title. */
  ariaLabel?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

/**
 * Module-level modal stack so stacked modals behave correctly:
 * - only the topmost modal handles Escape / Tab
 * - body scroll-lock is reference-counted (restored only when the last closes)
 */
const openModals: Array<() => void> = [];
let scrollLockCount = 0;

function lockScroll(): void {
  scrollLockCount += 1;
  if (scrollLockCount === 1) {
    document.body.style.overflow = "hidden";
  }
}

function unlockScroll(): void {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = "";
  }
}

export function Modal({
  isOpen,
  onClose,
  title,
  ariaLabel,
  children,
  maxWidth = "max-w-lg",
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    previousActiveElement.current = document.activeElement as HTMLElement;

    const close = () => onCloseRef.current();
    openModals.push(close);
    lockScroll();

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    // Auto-focus first focusable element inside modal
    const timer = setTimeout(() => {
      if (modalContentRef.current) {
        const focusables = modalContentRef.current.querySelectorAll<HTMLElement>(focusableSelector);
        focusables[0]?.focus();
      }
    }, 50);

    const isTopmost = () => openModals[openModals.length - 1] === close;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only the topmost modal handles keyboard shortcuts.
      if (!isTopmost()) return;

      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }

      if (e.key === "Tab") {
        if (!modalContentRef.current) return;
        const focusables = Array.from(
          modalContentRef.current.querySelectorAll<HTMLElement>(focusableSelector)
        );
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) return;

        if (e.shiftKey) {
          if (document.activeElement === first || !modalContentRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !modalContentRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
      const i = openModals.indexOf(close);
      if (i >= 0) openModals.splice(i, 1);
      unlockScroll();
      previousActiveElement.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex p-4 overflow-y-auto bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : ariaLabel}
      onClick={(e) => {
        if (e.target === overlayRef.current) {
          onClose();
        }
      }}
    >
      <div
        ref={modalContentRef}
        className={`relative m-auto w-full ${maxWidth} max-h-[calc(100dvh-2rem)] flex flex-col bg-surface border border-edge rounded-3xl shadow-2xl overflow-hidden transition-colors`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-edge shrink-0">
          {title && (
            <h3
              id={titleId}
              className="text-lg font-serif font-bold text-ink tracking-wide"
            >
              {title}
            </h3>
          )}
          <div className="ml-auto">
            <IconButton label="Close" onClick={onClose} size="sm">
              <X size={18} strokeWidth={1.5} className="text-ink-muted hover:text-ink" />
            </IconButton>
          </div>
        </div>

        {/* Content (scrolls on short viewports) */}
        <div className="p-6 text-ink overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
