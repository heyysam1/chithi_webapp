import { ImageResponse } from "next/og";
import { THEME_COLORS } from "@/lib/theme";

export const runtime = "nodejs";
export const alt = "MyChithi — Anonymous Private Letters";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Warm postal card built from canonical design tokens (no hardcoded hex).
const CREAM = THEME_COLORS.surface.light;
const PAPER_EDGE = THEME_COLORS.edge.light;
const INK = THEME_COLORS.inkHeading.light;
const INK_MUTED = THEME_COLORS.inkMuted.light;
const WAX = THEME_COLORS.dangerText.light;
const PEACH = THEME_COLORS.wax.light;

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: CREAM,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* paper edge frame */}
        <div
          style={{
            position: "absolute",
            top: 24,
            left: 24,
            right: 24,
            bottom: 24,
            border: `3px solid ${PAPER_EDGE}`,
            borderRadius: 18,
            display: "flex",
          }}
        />

        {/* wax seal */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: WAX,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 28,
            boxShadow: "0 6px 24px rgba(168,58,42,0.35)",
          }}
        >
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: "50%",
              border: `2px solid ${CREAM}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
              color: CREAM,
              fontFamily: "serif",
            }}
          >
            চি
          </div>
        </div>

        {/* brand */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 20,
            marginBottom: 16,
          }}
        >
          <span
            style={{
              fontSize: 92,
              fontFamily: "serif",
              fontWeight: 700,
              color: INK,
              letterSpacing: "-0.02em",
            }}
          >
            MyChithi
          </span>
          <span
            style={{
              fontSize: 56,
              fontFamily: "serif",
              color: WAX,
            }}
          >
            চিঠি
          </span>
        </div>

        {/* tagline */}
        <div
          style={{
            fontSize: 30,
            color: INK_MUTED,
            textAlign: "center",
            maxWidth: 760,
            lineHeight: 1.45,
            fontFamily: "serif",
            fontStyle: "italic",
          }}
        >
          Anonymous letters that vanish after reading.
        </div>

        {/* pill */}
        <div
          style={{
            marginTop: 36,
            display: "flex",
            gap: 14,
            alignItems: "center",
            background: INK,
            borderRadius: 999,
            padding: "12px 32px",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: PEACH,
            }}
          />
          <span
            style={{
              fontSize: 22,
              color: CREAM,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            No signup · No tracking
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
