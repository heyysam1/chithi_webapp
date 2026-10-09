import React from "react";

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 md:p-12 border border-edge rounded-3xl bg-surface shadow-xl max-w-md mx-auto transition-colors">
      {/* Centred vintage envelope motif (decorative) */}
      <div className="w-16 h-16 mb-4 text-wax" aria-hidden="true">
        <svg
          viewBox="0 0 64 64"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="w-full h-full"
        >
          <rect x="6" y="14" width="52" height="36" rx="4" />
          <path d="M6 16L32 36L58 16" />
          <path d="M6 48L24 32" />
          <path d="M58 48L40 32" />
        </svg>
      </div>

      <h3 className="text-lg font-serif font-semibold text-ink mb-1">
        {title}
      </h3>
      <p className="text-sm text-ink-muted mb-6 leading-relaxed">
        {description}
      </p>

      {action && <div>{action}</div>}
    </div>
  );
}
