"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-9 h-9 rounded-full border border-edge bg-surface opacity-50" />
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to Day Mode" : "Switch to Dark Mode"}
      title={isDark ? "Switch to Day Mode" : "Switch to Dark Mode"}
      className="relative w-9 h-9 rounded-full border border-edge bg-surface hover:bg-peach/40 dark:hover:bg-surface-raised text-ink dark:text-peach flex items-center justify-center transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-wax"
    >
      {isDark ? (
        <Sun size={15} className="text-peach transition-transform duration-300 rotate-0 hover:rotate-45" />
      ) : (
        <Moon size={15} className="text-ink transition-transform duration-300 rotate-0 hover:-rotate-12" />
      )}
    </button>
  );
}
