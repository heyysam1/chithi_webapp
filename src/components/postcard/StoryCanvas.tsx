"use client";

import React from "react";
import { THEME_COLORS, PAPER_COLORS } from "@/lib/theme";

export interface StoryCanvasProps {
  username: string;
  /** Public link without the scheme, e.g. "mychithi.vercel.app/sami07". */
  displayUrl: string;
  canvasRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Off-screen 540x960 (exported at 2x = 1080x1920) story share image.
 * Deliberately quiet, in the spirit of the letter postcard: one paper
 * card on the app's dark plum, the owner's link, and two small corner
 * labels - handle on the left, site name on the right.
 */
export function StoryCanvas({ username, displayUrl, canvasRef }: StoryCanvasProps) {
  const dark = {
    bg: THEME_COLORS.canvas.dark,
    surface: THEME_COLORS.surface.dark,
    edge: THEME_COLORS.edge.dark,
    ink: THEME_COLORS.ink.dark,
    muted: THEME_COLORS.inkMuted.dark,
    gold: THEME_COLORS.gold.dark,
  };

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        left: "-10000px",
        top: 0,
        width: "540px",
        height: "960px",
        zIndex: -100,
        pointerEvents: "none",
      }}
    >
      <div
        ref={canvasRef}
        style={{
          width: "540px",
          height: "960px",
          backgroundColor: dark.bg,
          position: "relative",
          overflow: "hidden",
          fontFamily: "var(--font-display), Georgia, 'Times New Roman', serif",
        }}
      >
        {/* Dashed postal frame */}
        <div
          style={{
            position: "absolute",
            inset: "18px",
            border: "1.5px dashed rgba(255, 229, 180, 0.28)",
            borderRadius: "20px",
          }}
        />

        {/* Centre card + link */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 48px",
          }}
        >
          <div
            style={{
              backgroundColor: PAPER_COLORS.parchment.base,
              borderRadius: "22px",
              padding: "46px 38px 38px",
              width: "100%",
              transform: "rotate(-1.5deg)",
              boxShadow: "0 24px 50px rgba(0,0,0,0.45)",
              textAlign: "center",
              position: "relative",
            }}
          >
            {/* Wax seal with the site logo */}
            <div
              style={{
                position: "absolute",
                top: "-27px",
                left: "50%",
                transform: "translateX(-50%)",
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: `radial-gradient(circle at 35% 30%, ${THEME_COLORS.wax.light}, ${THEME_COLORS.waxDim.light} 72%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 8px 18px rgba(0,0,0,0.35)",
                border: "2px solid rgba(255,246,233,0.85)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt=""
                width={36}
                height={36}
                style={{ borderRadius: "9px" }}
              />
            </div>

            <div
              style={{
                fontSize: "31px",
                lineHeight: 1.3,
                fontWeight: 700,
                color: THEME_COLORS.inkHeading.light,
                marginTop: "12px",
              }}
            >
              Send me an
              <br />
              <span style={{ fontStyle: "italic", color: THEME_COLORS.waxDim.light }}>
                anonymous letter
              </span>
            </div>
            <div
              style={{
                fontSize: "17.5px",
                color: THEME_COLORS.inkMuted.light,
                marginTop: "14px",
              }}
            >
              নাম ছাড়াই মনের কথা লিখে পাঠাও
            </div>
            <div
              style={{
                marginTop: "22px",
                fontSize: "10.5px",
                letterSpacing: "2.5px",
                color: THEME_COLORS.goldDim.light,
                textTransform: "uppercase",
                fontFamily: "Arial, sans-serif",
              }}
            >
              No signup · Burns after reading
            </div>
          </div>

          {/* Link pill */}
          <div
            style={{
              marginTop: "34px",
              fontFamily: "'Courier New', monospace",
              fontSize: "16.5px",
              color: dark.gold,
              backgroundColor: dark.surface,
              border: `1.5px solid ${dark.edge}`,
              padding: "11px 24px",
              borderRadius: "999px",
              whiteSpace: "nowrap",
            }}
          >
            {displayUrl}
          </div>
        </div>

        {/* Corner labels: handle left in the username font, site name
            right in the brand font - small and quiet */}
        <div
          style={{
            position: "absolute",
            left: "34px",
            bottom: "28px",
            fontSize: "17px",
            color: dark.muted,
            fontFamily: "var(--font-username), 'Courgette', cursive",
          }}
        >
          @{username}
        </div>
        <div
          style={{
            position: "absolute",
            right: "34px",
            bottom: "30px",
            fontSize: "13px",
            fontWeight: 600,
            letterSpacing: "0.02em",
            color: dark.muted,
            fontFamily: "var(--font-display), Georgia, serif",
          }}
        >
          MyChithi
        </div>
      </div>
    </div>
  );
}
