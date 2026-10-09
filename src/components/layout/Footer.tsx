"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useLocale } from "@/hooks/useLocale";

export function Footer() {
  const { t } = useLocale();

  return (
    <footer className="w-full border-t border-edge bg-canvas py-8 px-4 sm:px-6 mt-auto transition-colors">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ink-muted">
        {/* Left: Brand mark with miniature logo + Tagline */}
        <div className="flex items-center gap-2.5">
          <div className="relative w-6 h-6 shrink-0">
            <Image
              src="/logo.png"
              alt="Chithi Logo"
              width={24}
              height={24}
              className="w-full h-full object-contain"
            />
          </div>
          <span className="font-serif font-bold text-ink dark:text-ink-heading">
            Chithi চিঠি
          </span>
          <span className="text-edge">·</span>
        </div>

        {/* Links row */}
        <div className="flex items-center gap-5">
          <Link
            href="/feed"
            className="hover:text-wax transition-colors"
          >
            {t("footer.feed")}
          </Link>
          <Link
            href="/bottle"
            className="hover:text-wax transition-colors"
          >
            {t("footer.bottle")}
          </Link>
          <Link
            href="/about"
            className="hover:text-wax transition-colors"
          >
            {t("footer.about")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
