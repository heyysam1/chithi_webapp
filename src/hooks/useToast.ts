"use client";

import React, { useState, useCallback, createContext, useContext } from "react";

export interface ToastItem {
  id: string;
  message: string;
  type?: "info" | "success" | "warn" | "error";
}

interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastItem["type"]) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastItem["type"] = "info") => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      // Cap concurrent toasts at 3; drop the oldest so bursts can't stack a wall.
      setToasts((prev) => [...prev.slice(-2), { id, message, type }]);

      setTimeout(() => {
        removeToast(id);
      }, 4000);
    },
    [removeToast]
  );

  return React.createElement(
    ToastContext.Provider,
    { value: { toasts, showToast, removeToast } },
    children
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toasts: [],
      showToast: (msg: string) => console.info("[toast]", msg),
      removeToast: () => {},
    };
  }
  return ctx;
}
