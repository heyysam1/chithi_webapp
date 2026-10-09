import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { cookies } from "next/headers";
import { fontVariables } from "./fonts";
import "./globals.css";
import { LocaleProvider } from "@/i18n/provider";
import { ThemeProvider } from "@/hooks/useTheme";
import { SessionProvider } from "@/context/SessionContext";
import { ToastProvider } from "@/hooks/useToast";
import { GrainOverlay } from "@/components/layout/GrainOverlay";
import { env } from "@/lib/env";
import { Locale } from "@/i18n/types";

import { THEME_COLORS } from "@/lib/theme";

export const viewport: Viewport = {
  themeColor: THEME_COLORS.canvas.light,
  width: "device-width",
  initialScale: 1,
};

const appUrl = process.env.NEXT_PUBLIC_APP_URL || env.NEXT_PUBLIC_APP_URL;

const siteTitle = "MyChithi - Anonymous Private Letters";
const siteDescription =
  "Send anonymous letters that vanish after reading. No signup, no tracking - just your words, in Bangla or English.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: siteTitle,
    template: "%s · MyChithi",
  },
  description: siteDescription,
  keywords: [
    "anonymous letters",
    "secret letters",
    "private letters",
    "burn after reading",
    "self-destructing messages",
    "benami chithi",
    "bengali letters",
    "বাংলা চিঠি",
    "বেনামী চিঠি",
    "গোপন চিঠি",
    "message in a bottle",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    type: "website",
    url: "/",
    siteName: "MyChithi",
    // images: file-convention opengraph-image.tsx (1200x630) auto-discovered
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    // images: falls back to og:image (1200x630)
  },
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const rawLocale = cookieStore.get("chithi_locale")?.value;
  const initialLocale: Locale = rawLocale === "bn" ? "bn" : "en";

  return (
    <html lang={initialLocale} className={fontVariables} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "MyChithi",
              alternateName: "চিঠি",
              url: appUrl,
              description: siteDescription,
              inLanguage: ["en", "bn"],
            }),
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('chithi:theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-canvas text-ink antialiased min-h-screen relative selection:bg-peach selection:text-ink dark:selection:text-[hsl(22_24%_18%)] transition-colors duration-200">
        <ThemeProvider>
          <LocaleProvider initialLocale={initialLocale}>
            <SessionProvider>
              <ToastProvider>
                <GrainOverlay />
                {children}
              </ToastProvider>
            </SessionProvider>
          </LocaleProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
