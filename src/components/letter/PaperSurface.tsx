"use client";

import React, { useRef, useEffect } from "react";
import { Clock, HeartCrack } from "lucide-react";
import { PaperStyleId, StampId, FontId } from "@/lib/types";
import { PAPERS, FONTS, getDeterministicRotation } from "@/lib/paper";
import { LETTER_BODY_MAX } from "@/lib/constants";

export interface PaperSurfaceProps {
  paper: PaperStyleId;
  stamp?: StampId;
  stampSeed?: string;
  font?: FontId;
  children?: React.ReactNode;
  variant?: "composer" | "reader" | "postcard" | "thumb";
  className?: string;
  watermark?: boolean;
  /** Left side of the postcard footer (e.g. "@username" or "Benami Kham").
   * The right side always carries the site name. Kept small and subtle. */
  footerLabel?: string;
  isEditable?: boolean;
  value?: string;
  onChange?: (val: string) => void;
  placeholder?: string;
}

export function PaperSurface({
  paper,
  stamp,
  stampSeed = "chithi",
  font,
  children,
  variant = "reader",
  className = "",
  watermark = false,
  footerLabel,
  isEditable = false,
  value = "",
  onChange,
  placeholder = "Write what you could never say in daylight...",
}: PaperSurfaceProps) {
  const def = PAPERS[paper] || PAPERS.parchment;
  const activeFontId = font || def.defaultFont;
  const activeFontDef = FONTS[activeFontId] || FONTS.handwriting1;
  const rotation = getDeterministicRotation(stampSeed);
  // Illustrated papers (starry, blossom) carry artwork around the edges
  // with a blank centre. The writing band is inset on every side so text
  // stays over the blank area: side art (cypress, flower stems) is cleared
  // by inline padding on the content wrapper, and the root gets deep
  // vertical padding, deepest at the bottom where the darkest art sits.
  const isIllustrated = paper === "starry" || paper === "blossom";
  // The percentages resolve against the surface WIDTH, so on wide
  // desktop composers uncapped values ballooned the paper's height
  // (about +210px at 870px wide). Clamp caps keep the writing band
  // clear of the artwork while holding the height close to the plain
  // papers on every screen size.
  const artRootPadding =
    isIllustrated && (variant === "composer" || variant === "reader")
      ? {
          paddingTop: "clamp(36px, 9%, 72px)",
          paddingBottom: "clamp(48px, 14%, 112px)",
        }
      : isIllustrated && variant === "postcard"
        ? { paddingTop: "16%", paddingBottom: "22%" }
        : isIllustrated && variant === "thumb"
          ? { paddingTop: "13%", paddingBottom: "10%" }
          : {};
  // Thumbs letterbox the artwork (see artThumbFit), so the blank centre
  // is narrower there and the text band needs deeper side insets.
  const artInlineInset = isIllustrated
    ? variant === "thumb"
      ? {
          paddingLeft: "26%",
          paddingRight: stamp ? "max(26%, 5rem)" : "26%",
        }
      : {
          paddingLeft: "11%",
          // Keep clearing the corner stamp as well as the side artwork.
          paddingRight: stamp ? "max(11%, 5rem)" : "11%",
        }
    : {};
  // Feed thumbnails are landscape while the artwork is portrait, so
  // "cover" crops the artwork's top and bottom edges away. Thumbs use
  // "contain" instead: the whole artwork stays visible, letterboxed by
  // the paper's own base color.
  const artThumbFit =
    isIllustrated && variant === "thumb"
      ? { backgroundSize: "contain", backgroundRepeat: "no-repeat" }
      : {};

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea as text expands
  useEffect(() => {
    if (isEditable && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(300, textareaRef.current.scrollHeight)}px`;
    }
  }, [value, isEditable]);

  // Variant sizing and spacing styles
  const variantStyles = {
    composer: "p-8 sm:p-12 min-h-[460px] rounded-3xl",
    reader: "p-8 sm:p-12 min-h-[420px] rounded-3xl",
    postcard: "p-12 w-[540px] h-[960px] flex flex-col justify-between rounded-none",
    thumb: "p-5 min-h-[220px] max-h-[320px] sm:h-[340px] sm:max-h-[340px] overflow-hidden rounded-2xl text-sm",
  };

  // Font family resolution: custom chosen font with fallback to Bengali typography
  const resolvedFontFamily = `${activeFontDef.fontVar}, var(--font-bn-paper), serif`;

  // Line height: 32px exact baseline for typewriter notebook ruling, leading-[2] for parchment/rose
  const lineHeightClass = paper === "typewriter" ? "leading-[32px]" : "leading-[2]";

  return (
    <div
      className={`relative paper-${paper} ${variantStyles[variant]} transition-all duration-300 select-text ${className}`}
      style={{
        fontFamily: resolvedFontFamily,
        ...artRootPadding,
        ...artThumbFit,
      }}
    >
      {/* Stamp in Top-Right */}
      {stamp && (
        <div
          className="absolute top-6 right-6 pointer-events-none select-none z-10"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          {stamp === "wax" && (
            <div className="w-12 h-12 rounded-full bg-wax border border-wax-dim shadow-md flex items-center justify-center text-ivory">
              <span className="font-serif font-bold text-xl italic select-none">
                C
              </span>
            </div>
          )}

          {stamp === "topSecret" && (
            <div className="px-2.5 py-1 border border-current text-[11px] font-accent uppercase tracking-[0.12em] font-semibold opacity-85 rounded-sm">
              CONFIDENTIAL
            </div>
          )}

          {stamp === "memory" && (
            <div className="w-11 h-11 rounded-full border border-gold/70 flex items-center justify-center text-gold">
              <Clock size={20} strokeWidth={1.25} />
            </div>
          )}

          {stamp === "heartbreak" && (
            <div className="w-11 h-11 rounded-full border border-wax flex items-center justify-center text-wax">
              <HeartCrack size={20} strokeWidth={1.25} />
            </div>
          )}
        </div>
      )}

      {/* Botanical Sprig Line Art for Rose Paper */}
      {paper === "rose" && (
        <div className="absolute bottom-5 right-5 pointer-events-none opacity-20 text-current">
          <svg
            width="64"
            height="64"
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
          >
            <path d="M12 40C20 32 26 22 28 8" />
            <path d="M22 26C20 20 23 16 28 15C29 20 26 24 22 26Z" />
            <path d="M17 34C13 30 14 25 19 23C21 27 19 32 17 34Z" />
            <path d="M28 8C33 8 36 12 34 16C30 17 28 13 28 8Z" />
          </svg>
        </div>
      )}

      {/* Direct-On-Paper Interactive Writing Area or Static Render */}
      <div
        className={`relative z-0 text-[1.125rem] ${lineHeightClass} ${stamp ? "pr-16 sm:pr-20" : ""}`}
        style={artInlineInset}
      >
        {isEditable ? (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder}
            rows={8}
            maxLength={LETTER_BODY_MAX}
            className="w-full bg-transparent border-0 outline-none resize-none overflow-hidden placeholder:text-current/50 text-inherit focus:ring-0 focus:outline-none p-0 selection:bg-gold/30"
            style={{
              fontFamily: resolvedFontFamily,
              caretColor: "currentColor",
            }}
          />
        ) : (
          children
        )}
      </div>

      {/* Postcard footer: owner's handle on the left, site name on the
          right. Deliberately small and quiet so it never bothers the
          reader of the letter itself. */}
      {watermark && (
        <div
          className="mt-auto pt-5 border-t flex items-center justify-between"
          style={{
            // On the starry postcard the footer lands on the dark village
            // band of the artwork, so it renders in the paper's own cream
            // base color to stay readable.
            color: paper === "starry" ? PAPERS.starry.baseColor : undefined,
            borderColor: "rgba(128, 110, 80, 0.25)",
            opacity: paper === "starry" ? 0.85 : 0.6,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-username), 'Courgette', cursive",
              fontSize: 15,
              lineHeight: 1,
            }}
          >
            {footerLabel ?? ""}
          </span>
          <span
            style={{
              fontFamily: "var(--font-display), Georgia, serif",
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: "0.01em",
              lineHeight: 1,
            }}
          >
            MyChithi
          </span>
        </div>
      )}
    </div>
  );
}
