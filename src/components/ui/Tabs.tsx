import React, { useRef } from "react";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

export interface TabsProps<T extends string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (tabId: T) => void;
  ariaLabel?: string;
}

export function Tabs<T extends string>({
  tabs,
  activeTab,
  onChange,
  ariaLabel = "Navigation Tabs",
}: TabsProps<T>) {
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeTab)
  );

  /** Move to a tab (wrapping), activate it, and move focus — ARIA tabs pattern. */
  const goTo = (index: number) => {
    const count = tabs.length;
    if (count === 0) return;
    const next = ((index % count) + count) % count;
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.id);
    btnRefs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(activeIndex + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(activeIndex - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      goTo(0);
    } else if (e.key === "End") {
      e.preventDefault();
      goTo(tabs.length - 1);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className="flex items-center gap-6 border-b border-edge overflow-x-auto select-none"
    >
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 py-3 px-1 text-sm font-medium transition-colors relative min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-wax focus-visible:outline-offset-2 ${
              isActive ? "text-ink font-semibold" : "text-ink-muted hover:text-ink"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {isActive && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-wax rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
