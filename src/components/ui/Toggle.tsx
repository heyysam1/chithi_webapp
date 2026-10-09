import React, { useId } from "react";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  id,
}: ToggleProps) {
  const reactId = useId();
  const toggleId = id ?? `toggle-${reactId}`;

  return (
    <label
      htmlFor={toggleId}
      className={`inline-flex items-center gap-3 cursor-pointer select-none ${
        disabled ? "opacity-40 cursor-not-allowed" : ""
      }`}
    >
      <div className="relative">
        <input
          id={toggleId}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <div
          className={`w-11 h-6 rounded-full transition-colors duration-200 border peer-focus-visible:ring-2 peer-focus-visible:ring-wax peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas ${
            checked
              ? "bg-wax border-wax"
              : "bg-edge-subtle border-edge-subtle"
          }`}
        />
        <div
          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "transform translate-x-5" : ""
          }`}
        />
      </div>
      {label && (
        <span className="text-xs sm:text-sm font-medium text-ink select-none">
          {label}
        </span>
      )}
    </label>
  );
}
