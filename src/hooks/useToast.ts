"use client";

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  createContext,
  useContext,
} from "react";

export interface ToastItem {
  id: string;
  message: string;
  type?: "info" | "success" | "warn" | "error";
}

/**
 * Auto-dismiss durations per toast type (ms). Errors are persistent —
 * they must be dismissed manually so failure feedback can't be missed.
 */
const TYPE_DURATIONS: Record<NonNullable<ToastItem["type"]>, number> = {
  error: 0,
  warn: 6000,
  success: 4000,
  info: 4000,
};

interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastItem["type"]) => void;
  removeToast: (id: string) => void;
  pauseToast: (id: string) => void;
  resumeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

interface PendingTimer {
  timeout: ReturnType<typeof setTimeout>;
  remainingMs: number;
  startedAt: number;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, PendingTimer>());

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t.timeout);
      timers.current.delete(id);
    }
  }, []);

  const removeToast = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer]
  );

  const armTimer = useCallback(
    (id: string, ms: number) => {
      clearTimer(id);
      if (ms <= 0) return; // persistent toast
      timers.current.set(id, {
        timeout: setTimeout(() => removeToast(id), ms),
        remainingMs: ms,
        startedAt: Date.now(),
      });
    },
    [clearTimer, removeToast]
  );

  const showToast = useCallback(
    (message: string, type: ToastItem["type"] = "info") => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const durationMs = TYPE_DURATIONS[type];
      setToasts((prev) => {
        const next = [...prev.slice(-2), { id, message, type }];
        // Clear timers of toasts dropped by the cap (idempotent under StrictMode).
        for (const p of prev) {
          if (!next.some((n) => n.id === p.id)) clearTimer(p.id);
        }
        return next;
      });
      armTimer(id, durationMs);
    },
    [armTimer, clearTimer]
  );

  const pauseToast = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (!t) return;
    clearTimeout(t.timeout);
    const elapsed = Date.now() - t.startedAt;
    timers.current.set(id, {
      ...t,
      remainingMs: Math.max(0, t.remainingMs - elapsed),
    });
  }, []);

  const resumeToast = useCallback(
    (id: string) => {
      const t = timers.current.get(id);
      if (!t) return;
      if (t.remainingMs <= 0) {
        removeToast(id);
        return;
      }
      timers.current.set(id, {
        timeout: setTimeout(() => removeToast(id), t.remainingMs),
        remainingMs: t.remainingMs,
        startedAt: Date.now(),
      });
    },
    [removeToast]
  );

  // Safety net: clear any pending timers on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t.timeout));
      map.clear();
    };
  }, []);

  return React.createElement(
    ToastContext.Provider,
    { value: { toasts, showToast, removeToast, pauseToast, resumeToast } },
    children
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    const noop = () => {};
    return {
      toasts: [],
      showToast: (msg: string) => console.info("[toast]", msg),
      removeToast: noop,
      pauseToast: noop,
      resumeToast: noop,
    };
  }
  return ctx;
}
