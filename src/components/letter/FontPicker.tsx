"use client";

import React from "react";
import { FontId } from "@/lib/types";
import { FONTS, AVAILABLE_FONTS, getFontName, getFontCategory } from "@/lib/paper";
import { useLocale } from "@/hooks/useLocale";

export interface FontPickerProps {
  selected: FontId;
  onChange: (font: FontId) => void;
}

export function FontPicker({ selected, onChange }: FontPickerProps) {
  const { locale, t } = useLocale();

  const currentFont = FONTS[selected] || FONTS.dearSecret;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-mono uppercase tracking-wider text-ink-muted">
          {t("composer.fontLabel")}
        </label>
        <span className="text-[11px] text-wax font-serif italic">
          {getFontName(currentFont, locale)}
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label="Handwriting font"
        className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 select-none"
      >
        {AVAILABLE_FONTS.map((key) => {
          const f = FONTS[key];
          const isSelected =
            selected === key ||
            (selected === "handwriting1" && key === "bnCursive") ||
            (selected === "handwriting2" && key === "bnDiary") ||
            (selected === "handwriting3" && key === "bnScribble") ||
            (selected === "typewriter" && key === "bnTypewriter") ||
            (selected === "serif" && key === "bnSerif") ||
            (selected === "calligraphy" && key === "dearSecret") ||
            (selected === "casual" && key === "heartfelt") ||
            (selected === "pencil" && key === "untoldTale");

          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(key)}
              className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-wax flex flex-col justify-between cursor-pointer ${
                isSelected
                  ? "bg-peach/80 dark:bg-surface-raised border-wax text-ink dark:text-ink-heading ring-1 ring-wax shadow-xs"
                  : "bg-canvas dark:bg-surface border-edge text-ink-muted hover:text-ink dark:hover:text-ink-heading hover:border-wax/60"
              }`}
            >
              <span
                className="text-xs sm:text-sm leading-snug mb-1 block font-medium break-words"
                style={{ fontFamily: `${f.fontVar}` }}
              >
                {f.sample}
              </span>
              <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-wider block break-words text-ink-muted">
                {getFontCategory(f, locale)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
