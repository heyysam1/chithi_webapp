import React from "react";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", error = false, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        aria-invalid={error || undefined}
        className={`w-full min-h-[140px] px-4 py-3 text-base bg-surface-raised text-ink placeholder:text-ink-muted/60 rounded-xl border transition-colors duration-150 whitespace-pre-wrap focus:outline-none focus:border-wax focus:ring-1 focus:ring-wax shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
          error
            ? "border-danger focus:border-danger focus:ring-danger"
            : "border-edge hover:border-wax"
        } ${className}`}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";
