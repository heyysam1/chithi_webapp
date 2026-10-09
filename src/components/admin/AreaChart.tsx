"use client";

import React, { useId, useMemo, useRef, useState } from "react";
import { useLocale } from "@/hooks/useLocale";
import type { SeriesPoint } from "@/lib/adminApi";

export interface AreaChartProps {
  points: SeriesPoint[];
  height?: number;
  emptyLabel: string;
  accent?: "wax" | "peach";
}

const W = 680;

interface Pt {
  x: number;
  y: number;
}

/** Catmull-Rom → cubic bezier smoothing for a Vercel-like curve. */
function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0]!.x.toFixed(1)} ${pts[0]!.y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * Premium SVG area chart — smooth curve, gradient fill, Vercel-style
 * hover (crosshair + dot + floating tooltip). Theme-aware via CSS vars.
 * No extra dependencies. Used sparingly: overview activity chart only.
 */
export function AreaChart({
  points,
  height = 220,
  emptyLabel,
  accent = "wax",
}: AreaChartProps) {
  const { locale } = useLocale();
  const gradId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const accentVar = accent === "peach" ? "var(--peach)" : "var(--wax)";

  const geom = useMemo(() => {
    const padL = 40;
    const padR = 12;
    const padT = 14;
    const padB = 30;
    const innerW = W - padL - padR;
    const innerH = height - padT - padB;
    const max = Math.max(1, ...points.map((p) => p.value));
    const n = points.length;
    const pts: Pt[] = points.map((p, i) => ({
      x: n === 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW,
      y: padT + innerH - (p.value / max) * innerH,
    }));
    return { padL, padR, padT, padB, innerW, innerH, max, pts, baseY: padT + innerH };
  }, [points, height]);

  const isEmpty = points.length === 0 || points.every((p) => p.value === 0);

  const ticks = [0, 1, 2, 3, 4].map((i) => Math.round((geom.max * i) / 4));
  const labelEvery = Math.max(1, Math.ceil(points.length / 10));

  const line = smoothPath(geom.pts);
  const area =
    line.length > 0
      ? `${line} L ${geom.pts[geom.pts.length - 1]!.x.toFixed(1)} ${geom.baseY} L ${geom.pts[0]!.x.toFixed(1)} ${geom.baseY} Z`
      : "";

  const formatDate = (dateStr: string) => {
    const d = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(locale === "bn" ? "bn-BD" : "en-US", {
      month: "short",
      day: "numeric",
      weekday: "short",
    });
  };

  const handleMove = (e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    geom.pts.forEach((p, i) => {
      const dist = Math.abs(p.x - svgX);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setHover(best);
  };

  if (isEmpty) {
    return (
      <p className="text-sm text-ink-muted text-center py-10">{emptyLabel}</p>
    );
  }

  const hp = hover !== null ? geom.pts[hover]! : null;
  const pct = hp ? (hp.x / W) * 100 : 0;
  // Keep the tooltip inside the chart bounds near the edges.
  const anchorClass =
    pct > 80
      ? "-translate-x-[calc(100%-10px)]"
      : pct < 20
        ? "-translate-x-2.5"
        : "-translate-x-1/2";

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        className="w-full cursor-crosshair"
        style={{ height }}
        role="img"
        aria-label="Area chart"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              style={{ stopColor: accentVar }}
              stopOpacity={0.35}
            />
            <stop
              offset="100%"
              style={{ stopColor: accentVar }}
              stopOpacity={0.03}
            />
          </linearGradient>
        </defs>

        {ticks.map((tv, i) => {
          const y = geom.padT + geom.innerH - (tv / geom.max) * geom.innerH;
          return (
            <g key={i}>
              <line
                x1={geom.padL}
                x2={W - geom.padR}
                y1={y}
                y2={y}
                className="stroke-edge"
                strokeWidth={1}
                strokeDasharray={tv === 0 ? undefined : "3 4"}
              />
              <text
                x={geom.padL - 6}
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

        {area.length > 0 && <path d={area} fill={`url(#${gradId})`} />}
        {line.length > 0 && (
          <path
            d={line}
            fill="none"
            strokeWidth={2.5}
            strokeLinecap="round"
            style={{ stroke: accentVar }}
          />
        )}

        {geom.pts.length === 1 && hp === null && (
          <circle
            cx={geom.pts[0]!.x}
            cy={geom.pts[0]!.y}
            r={4}
            style={{ fill: accentVar }}
          />
        )}

        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text
              key={`${p.date}-${i}`}
              x={geom.pts[i]!.x}
              y={height - 10}
              textAnchor="middle"
              fontSize={10}
              className="fill-ink-muted"
            >
              {p.date.slice(5)}
            </text>
          ) : null
        )}

        {hp && (
          <g>
            <line
              x1={hp.x}
              x2={hp.x}
              y1={geom.padT}
              y2={geom.baseY}
              className="stroke-ink-muted opacity-40"
              strokeWidth={1}
            />
            <circle
              cx={hp.x}
              cy={hp.y}
              r={5}
              className="fill-surface"
              strokeWidth={2.5}
              style={{ stroke: accentVar }}
            />
          </g>
        )}
      </svg>

      {hp && hover !== null && (
        <div
          className="absolute z-10 pointer-events-none"
          style={{ left: `${pct}%`, top: `${(hp.y / height) * 100}%` }}
        >
          <div
            className={`${anchorClass} -translate-y-[calc(100%+14px)] rounded-xl border border-edge bg-surface px-3 py-1.5 shadow-lg whitespace-nowrap`}
          >
            <div className="font-mono text-sm font-bold text-ink">
              {points[hover]!.value.toLocaleString()}
            </div>
            <div className="text-[11px] text-ink-muted">
              {formatDate(points[hover]!.date)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
