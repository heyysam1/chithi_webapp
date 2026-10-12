import localFont from "next/font/local";
import {
  Fraunces,
  Plus_Jakarta_Sans,
  Caveat,
  Dancing_Script,
  Homemade_Apple,
  Courier_Prime,
  Special_Elite,
  Courgette,
  Hind_Siliguri,
  Noto_Serif_Bengali,
} from "next/font/google";

// Headings & Display: Fraunces (warm, organic, human curves)
export const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
  adjustFontFallback: true,
  fallback: ["Hind Siliguri", "Noto Serif Bengali", "serif"],
});

// UI Body & Buttons: Plus Jakarta Sans (warm, clean, modern feel)
export const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
  display: "swap",
  adjustFontFallback: true,
  fallback: ["Hind Siliguri", "Noto Serif Bengali", "sans-serif"],
});

// Bengali UI Fallback
export const hindSiliguri = Hind_Siliguri({
  subsets: ["bengali"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bn-ui",
  display: "swap",
  adjustFontFallback: true,
  fallback: ["Noto Serif Bengali", "sans-serif"],
});

// Bengali Book Print / Classic Serif Fallback
export const notoSerifBengali = Noto_Serif_Bengali({
  subsets: ["bengali"],
  weight: ["400", "600", "700"],
  variable: "--font-bn-paper",
  display: "swap",
  adjustFontFallback: true,
  fallback: ["Hind Siliguri", "serif"],
});

// English Cursive & Handwriting
export const caveat = Caveat({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-hand",
  display: "swap",
  adjustFontFallback: true,
  fallback: ["Hind Siliguri", "Noto Serif Bengali", "cursive", "sans-serif"],
});

export const dancingScript = Dancing_Script({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-calligraphy",
  display: "swap",
  adjustFontFallback: true,
  fallback: ["Hind Siliguri", "Noto Serif Bengali", "cursive", "sans-serif"],
});

export const homemadeApple = Homemade_Apple({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-pencil",
  display: "swap",
  adjustFontFallback: true,
  fallback: ["Hind Siliguri", "Noto Serif Bengali", "cursive", "sans-serif"],
});

export const courierPrime = Courier_Prime({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono-paper",
  display: "swap",
  adjustFontFallback: true,
  fallback: ["Hind Siliguri", "Noto Serif Bengali", "monospace"],
});

// Username identity font: Courgette (semi-calligraphic, ~40% flourish)
export const courgette = Courgette({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-username",
  display: "swap",
  adjustFontFallback: true,
  fallback: ["Hind Siliguri", "Noto Serif Bengali", "cursive"],
});

export const specialElite = Special_Elite({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-typewriter",
  display: "swap",
  adjustFontFallback: true,
  fallback: ["Hind Siliguri", "Noto Serif Bengali", "monospace"],
});

// Local Bengali Handwriting Fonts
export const bnHandwriting1 = localFont({
  src: "../../public/fonts/bensen-handwriting.ttf",
  variable: "--font-bn-hand-1",
  display: "swap",
  fallback: ["Noto Serif Bengali", "Hind Siliguri", "serif"],
});

export const bnHandwriting2 = localFont({
  src: "../../public/fonts/kornofuli-handwriting.ttf",
  variable: "--font-bn-hand-2",
  display: "swap",
  fallback: ["Hind Siliguri", "Noto Serif Bengali", "sans-serif"],
});

export const bnHandwriting3 = localFont({
  src: "../../public/fonts/solpic-handwriting.ttf",
  variable: "--font-bn-hand-3",
  display: "swap",
  fallback: ["Hind Siliguri", "Noto Serif Bengali", "cursive", "sans-serif"],
});

export const fontVariables = `${fraunces.variable} ${plusJakartaSans.variable} ${hindSiliguri.variable} ${notoSerifBengali.variable} ${caveat.variable} ${dancingScript.variable} ${homemadeApple.variable} ${courierPrime.variable} ${specialElite.variable} ${courgette.variable} ${bnHandwriting1.variable} ${bnHandwriting2.variable} ${bnHandwriting3.variable}`;
