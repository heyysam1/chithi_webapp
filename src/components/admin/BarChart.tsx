"use client";

import React from "react";
import type { SeriesPoint } from "@/lib/adminApi";

/**
 * Hand-rolled SVG bar chart — no extra dependencies.
 * Theme-aware: bar fill and grid colors come from the site's CSS-var
 * tokens (fill-wax, stroke-edge, text-ink-muted) so it works in
 * both light and dark mode.
 */
export function BarChart({
  points,
  height = 220,
  emptyLabel,
}: {
  points: SeriesPoint[];
  height?: number;
  emptyLabel: string;
}) {
  if (points.length === 0) {
    return (
      <p className="text-sm text-ink-muted text-center py-10">{emptyLabel}</p>
    );
  }

  const W = 680;
  const H = height;
  const padL = 40;
  const padR = 8;
  const padT = 14;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = Math.max(1, ...points.map((p) => p.value));
  const n = points.length;
  const slot = innerW / n;
  const barW = Math.max(4, Math.min(34, slot * 0.62));

  // Nice-ish y ticks (4 gridlines).
  const ticks = [0, 1, 2, 3, 4].map((i) => Math.round((max * i) / 4));

  const labelEvery = Math.max(1, Math.ceil(n / 10));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height }}
      role="img"
      aria-label="Bar chart"
    >
      {ticks.map((tv, i) => {
        const y = padT + innerH - (tv / max) * innerH;
        return (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y}
              y2={y}
              className="stroke-edge"
              strokeWidth={1}
              strokeDasharray={tv === 0 ? undefined : "3 4"}
            />
            <text
              x={padL - 6}
              y={y + 4}
              textAnchor="end"
              fontSize={10}
              className="fill-ink-muted"
            >
              {tv}
            </text>
          </g>
        );
      })}

      {points.map((p, i) => {
        const barH = Math.max(p.value > 0 ? 3 : 0, (p.value / max) * innerH);
        const x = padL + i * slot + (slot - barW) / 2;
        const y = padT + innerH - barH;
        return (
          <g key={`${p.date}-${i}`}>
            <title>{`${p.date}: ${p.value}`}</title>
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={Math.min(5, barW / 2)}
              className="fill-wax opacity-80 hover:opacity-100 transition-opacity"
            />
            {i % labelEvery === 0 && (
              <text
                x={x + barW / 2}
                y={H - 10}
                textAnchor="middle"
                fontSize={10}
                className="fill-ink-muted"
              >
                {p.date.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
