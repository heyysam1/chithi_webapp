"use client";

import React from "react";

/**
 * A single stat tile for the admin dashboard.
 * Postal-scrapbook styling: rounded-3xl card, serif value, wax icon chip.
 */
export interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  sub?: string;
  accent?: boolean;
}

export function StatCard({ label, value, icon, sub, accent = false }: StatCardProps) {
  return (
    <div
      className={`p-4 sm:p-5 rounded-3xl border border-edge shadow-sm transition-colors ${
        accent ? "bg-peach/40 dark:bg-surface" : "bg-surface"
      }`}
    >
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-10 h-10 shrink-0 rounded-2xl bg-peach/50 border border-edge flex items-center justify-center text-wax shadow-sm">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-serif font-bold text-ink leading-none truncate">
            {typeof value === "number" ? value.toLocaleString() : value}
          </div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted mt-1 leading-tight">
            {label}
          </div>
          {sub && (
            <div className="text-[11px] text-ink-muted mt-0.5 leading-tight">
              {sub}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
