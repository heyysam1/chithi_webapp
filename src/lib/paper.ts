import { PaperStyleId, StampId, FontId } from "./types";
import { PAPER_COLORS } from "./theme";

export interface FontDefinition {
  id: FontId;
  name: string;
  nameBn: string;
  category: string;
  categoryBn: string;
  fontVar: string;
  sample: string;
  sampleEn: string;
}

export const FONTS: Record<FontId, FontDefinition> = {
  // 3 Curated English Fonts
  dearSecret: {
    id: "dearSecret",
    name: "Dear Secret",
    nameBn: "Dear Secret",
    category: "Cursive Calligraphy",
    categoryBn: "Cursive Calligraphy",
    fontVar: "var(--font-calligraphy), var(--font-hand), cursive",
    sample: "Dear Secret",
    sampleEn: "Dear Secret",
  },
  heartfelt: {
    id: "heartfelt",
    name: "Heartfelt",
    nameBn: "Heartfelt",
    category: "Diary Note",
    categoryBn: "Diary Note",
    fontVar: "var(--font-hand), cursive",
    sample: "Heartfelt",
    sampleEn: "Heartfelt",
  },
  untoldTale: {
    id: "untoldTale",
    name: "Untold Tale",
    nameBn: "Untold Tale",
    category: "Scribble",
    categoryBn: "Scribble",
    fontVar: "var(--font-pencil), cursive",
    sample: "Untold Tale",
    sampleEn: "Untold Tale",
  },

  // 5 Original Bengali Fonts
  bnCursive: {
    id: "bnCursive",
    name: "আমার গোপন চিঠি",
    nameBn: "আমার গোপন চিঠি",
    category: "Cursive Calligraphy",
    categoryBn: "চারুলিপি",
    fontVar: "var(--font-bn-hand-1), var(--font-bn-paper), serif",
    sample: "আমার গোপন চিঠি",
    sampleEn: "আমার গোপন চিঠি",
  },
  bnDiary: {
    id: "bnDiary",
    name: "মনের না বলা কথা",
    nameBn: "মনের না বলা কথা",
    category: "Diary Nostalgia",
    categoryBn: "স্মৃতিকথা",
    fontVar: "var(--font-bn-hand-2), var(--font-bn-paper), serif",
    sample: "মনের না বলা কথা",
    sampleEn: "মনের না বলা কথা",
  },
  bnScribble: {
    id: "bnScribble",
    name: "ভালোবাসার এক টুকরো",
    nameBn: "ভালোবাসার এক টুকরো",
    category: "Everyday Scribble",
    categoryBn: "কথকতা",
    fontVar: "var(--font-bn-hand-3), var(--font-bn-paper), serif",
    sample: "ভালোবাসার এক টুকরো",
    sampleEn: "ভালোবাসার এক টুকরো",
  },
  bnTypewriter: {
    id: "bnTypewriter",
    name: "চিঠি ০৭/২৪",
    nameBn: "চিঠি ০৭/২৪",
    category: "Mechanical Typewriter",
    categoryBn: "টাইপরাইটার",
    fontVar: "var(--font-typewriter), var(--font-mono-paper), monospace",
    sample: "চিঠি ০৭/২৪",
    sampleEn: "চিঠি ০৭/২৪",
  },
  bnSerif: {
    id: "bnSerif",
    name: "চিরন্তন চিঠি",
    nameBn: "চিরন্তন চিঠি",
    category: "Classic Print Serif",
    categoryBn: "চিরায়ত",
    fontVar: "var(--font-bn-paper), var(--font-display), serif",
    sample: "চিরন্তন চিঠি",
    sampleEn: "চিরন্তন চিঠি",
  },

  // Backward compatibility aliases
  handwriting1: {
    id: "handwriting1",
    name: "আমার গোপন চিঠি",
    nameBn: "আমার গোপন চিঠি",
    category: "Cursive Calligraphy",
    categoryBn: "চারুলিপি",
    fontVar: "var(--font-bn-hand-1), var(--font-bn-paper), serif",
    sample: "আমার গোপন চিঠি",
    sampleEn: "আমার গোপন চিঠি",
  },
  handwriting2: {
    id: "handwriting2",
    name: "মনের না বলা কথা",
    nameBn: "মনের না বলা কথা",
    category: "Diary Nostalgia",
    categoryBn: "স্মৃতিকথা",
    fontVar: "var(--font-bn-hand-2), var(--font-bn-paper), serif",
    sample: "মনের না বলা কথা",
    sampleEn: "মনের না বলা কথা",
  },
  handwriting3: {
    id: "handwriting3",
    name: "ভালোবাসার এক টুকরো",
    nameBn: "ভালোবাসার এক টুকরো",
    category: "Everyday Scribble",
    categoryBn: "কথকতা",
    fontVar: "var(--font-bn-hand-3), var(--font-bn-paper), serif",
    sample: "ভালোবাসার এক টুকরো",
    sampleEn: "ভালোবাসার এক টুকরো",
  },
  typewriter: {
    id: "typewriter",
    name: "চিঠি ০৭/২৪",
    nameBn: "চিঠি ০৭/২৪",
    category: "Mechanical Typewriter",
    categoryBn: "টাইপরাইটার",
    fontVar: "var(--font-typewriter), var(--font-mono-paper), monospace",
    sample: "চিঠি ০৭/২৪",
    sampleEn: "চিঠি ০৭/২৪",
  },
  serif: {
    id: "serif",
    name: "চিরন্তন চিঠি",
    nameBn: "চিরন্তন চিঠি",
    category: "Classic Print Serif",
    categoryBn: "চিরায়ত",
    fontVar: "var(--font-bn-paper), var(--font-display), serif",
    sample: "চিরন্তন চিঠি",
    sampleEn: "চিরন্তন চিঠি",
  },
  calligraphy: {
    id: "calligraphy",
    name: "Dear Secret",
    nameBn: "Dear Secret",
    category: "Cursive Calligraphy",
    categoryBn: "Cursive Calligraphy",
    fontVar: "var(--font-calligraphy), var(--font-hand), cursive",
    sample: "Dear Secret",
    sampleEn: "Dear Secret",
  },
  casual: {
    id: "casual",
    name: "Heartfelt",
    nameBn: "Heartfelt",
    category: "Diary Note",
    categoryBn: "Diary Note",
    fontVar: "var(--font-hand), cursive",
    sample: "Heartfelt",
    sampleEn: "Heartfelt",
  },
  pencil: {
    id: "pencil",
    name: "Untold Tale",
    nameBn: "Untold Tale",
    category: "Scribble",
    categoryBn: "Scribble",
    fontVar: "var(--font-pencil), cursive",
    sample: "Untold Tale",
    sampleEn: "Untold Tale",
  },
};

export const AVAILABLE_FONTS: FontId[] = [
  "dearSecret",
  "heartfelt",
  "untoldTale",
  "bnCursive",
  "bnDiary",
  "bnScribble",
  "bnTypewriter",
  "bnSerif",
];

export interface PaperDefinition {
  id: PaperStyleId;
  labelKey: string;
  defaultFont: FontId;
  inkColor: string;
  baseColor: string;
  previewSwatch: string;
}

export const PAPERS: Record<PaperStyleId, PaperDefinition> = {
  parchment: {
    id: "parchment",
    labelKey: "papers.parchment",
    defaultFont: "bnDiary",
    inkColor: PAPER_COLORS.parchment.ink,
    baseColor: PAPER_COLORS.parchment.base,
    previewSwatch: "bg-surface border-edge",
  },
  midnight: {
    id: "midnight",
    labelKey: "papers.midnight",
    defaultFont: "bnCursive",
    inkColor: PAPER_COLORS.midnight.ink,
    baseColor: PAPER_COLORS.midnight.base,
    previewSwatch: "bg-surface-raised border-edge",
  },
  rose: {
    id: "rose",
    labelKey: "papers.rose",
    defaultFont: "dearSecret",
    inkColor: PAPER_COLORS.rose.ink,
    baseColor: PAPER_COLORS.rose.base,
    previewSwatch: "bg-lavender-surface border-lavender-edge",
  },
  typewriter: {
    id: "typewriter",
    labelKey: "papers.typewriter",
    defaultFont: "bnTypewriter",
    inkColor: PAPER_COLORS.typewriter.ink,
    baseColor: PAPER_COLORS.typewriter.base,
    previewSwatch: "bg-surface border-edge",
  },
  rainy: {
    id: "rainy",
    labelKey: "papers.rainy",
    defaultFont: "bnScribble",
    inkColor: PAPER_COLORS.rainy.ink,
    baseColor: PAPER_COLORS.rainy.base,
    previewSwatch: "bg-skymist border-skymist-edge",
  },
};

export interface StampDefinition {
  id: StampId;
  labelKey: string;
}

export const STAMPS: Record<StampId, StampDefinition> = {
  wax: { id: "wax", labelKey: "stamps.wax" },
  topSecret: { id: "topSecret", labelKey: "stamps.topSecret" },
  memory: { id: "memory", labelKey: "stamps.memory" },
  heartbreak: { id: "heartbreak", labelKey: "stamps.heartbreak" },
};

export function getDeterministicRotation(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const normalized = Math.abs(hash) % 1000;
  return (normalized / 1000) * 1.6 - 0.8;
}

export function getFontName(font: FontDefinition, locale: string): string {
  return locale === "bn" ? font.nameBn || font.name : font.name;
}

export function getFontCategory(font: FontDefinition, locale: string): string {
  return locale === "bn"
    ? font.categoryBn || font.nameBn || font.category
    : font.category || font.name;
}

