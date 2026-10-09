import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { THEME_COLORS } from "@/lib/theme";

export const runtime = "nodejs";
export const alt = "MyChithi - Anonymous Private Letters";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Warm postal card built from canonical design tokens (no hardcoded hex).
// Dark backdrop keeps the cream stamp paper visually separate.
const BACKDROP = THEME_COLORS.inkHeading.light;
const PAPER = THEME_COLORS.surface.light;
const INK = THEME_COLORS.inkHeading.light;
const INK_MUTED = THEME_COLORS.inkMuted.light;
const PEACH = THEME_COLORS.wax.light;

// Stamp paper asset is portrait 692x930; render at height 560.
const STAMP_W = 417;
const STAMP_H = 560;
const STAMP_LEFT = (size.width - STAMP_W) / 2;
const STAMP_TOP = (size.height - STAMP_H) / 2;

export default async function Image() {
  const [logoBuffer, stampBuffer] = await Promise.all([
    readFile(join(process.cwd(), "public/logo.png")),
    readFile(join(process.cwd(), "public/textures/stamp-paper.svg")),
  ]);
  const logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;
  const stampSrc = `data:image/svg+xml;base64,${stampBuffer.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          background: BACKDROP,
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
        }}
      >
        {/* vertical stamp paper */}
        <img
          src={stampSrc}
          width={STAMP_W}
          height={STAMP_H}
          style={{
            position: "absolute",
            left: STAMP_LEFT,
            top: STAMP_TOP,
          }}
        />

        {/* text on the paper */}
        <div
          style={{
            position: "absolute",
            left: STAMP_LEFT,
            top: STAMP_TOP,
            width: STAMP_W,
            height: STAMP_H,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 48px",
          }}
        >
          <img
            src={logoSrc}
            width={88}
            height={88}
            style={{ marginBottom: 18, borderRadius: 20 }}
          />
          <div
            style={{
              fontSize: 56,
              fontFamily: "serif",
              fontWeight: 700,
              color: INK,
              letterSpacing: "-0.02em",
              marginBottom: 12,
            }}
          >
            MyChithi
          </div>
          <div
            style={{
              fontSize: 21,
              color: INK_MUTED,
              textAlign: "center",
              lineHeight: 1.5,
              fontFamily: "serif",
              fontStyle: "italic",
              marginBottom: 24,
            }}
          >
            Anonymous letters that vanish after reading.
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: INK,
              borderRadius: 999,
              padding: "9px 24px",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: PEACH,
                marginRight: 10,
              }}
            />
            <span
              style={{
                fontSize: 16,
                color: PAPER,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              No signup · No tracking
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
