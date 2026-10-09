import React from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { ToastViewport } from "../ui/Toast";

export function PageShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="relative min-h-screen overflow-x-clip flex flex-col bg-canvas text-ink transition-colors duration-200">
      {/* Skip link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-canvas focus:text-wax focus:border focus:border-wax focus:rounded-full shadow-sm"
      >
        Skip to content
      </a>

      <Header />

      <main
        id="main-content"
        className={`flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 md:py-12 ${className}`}
      >
        {children}
      </main>

      <Footer />
      <ToastViewport />
    </div>
  );
}
