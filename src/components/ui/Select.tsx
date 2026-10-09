import React from "react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ children, className = "", error = false, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          aria-invalid={error || undefined}
          className={`w-full min-h-[44px] px-4 py-2.5 pr-9 text-base bg-surface-raised text-ink rounded-xl border appearance-none transition-colors duration-150 focus:outline-none focus:border-wax focus:ring-1 focus:ring-wax shadow-sm disabled:opacity-50 disabled:cursor-not-allowed [&>option]:bg-surface [&>option]:text-ink dark:[&>option]:bg-surface-raised dark:[&>option]:text-ink [color-scheme:light_dark] cursor-pointer ${
            error
              ? "border-danger focus:border-danger"
              : "border-edge hover:border-wax"
          } ${className}`}
          {...props}
        >
          {children}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-ink-muted">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </div>
      </div>
    );
  }
);

Select.displayName = "Select";
