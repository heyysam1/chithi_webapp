/**
 * Canonical design system theme constants.
 * Single source of truth for color tokens used in Satori (@vercel/og), canvas, or JS contexts.
 */
export const THEME_COLORS = {
  canvas: {
    light: "#FFFDF9",
    dark: "#0C0314",
  },
  surface: {
    light: "#FFF8F0",
    dark: "#170A24",
  },
  surfaceRaised: {
    light: "#FFFFFF",
    dark: "#231235",
  },
  edge: {
    light: "#F0E2D2",
    dark: "#351D4D",
  },
  edgeSubtle: {
    light: "#EBE3D5",
    dark: "#452466",
  },
  ink: {
    light: "#382A22",
    dark: "#F5EBE6",
  },
  inkHeading: {
    light: "#2C1E16",
    dark: "#FFF8F0",
  },
  inkMuted: {
    light: "#857367",
    dark: "#A592A4",
  },
  inkFaint: {
    light: "#A39992",
    dark: "#705B73",
  },
  wax: {
    light: "#E88B60",
    dark: "#E88B60",
  },
  waxDim: {
    light: "#D67448",
    dark: "#D67448",
  },
  gold: {
    light: "#E88B60",
    dark: "#FFE5B4",
  },
  goldDim: {
    light: "#B86640",
    dark: "#E88B60",
  },
  peach: {
    light: "#FFE5B4",
    dark: "#FFE5B4",
  },
  peachHover: {
    light: "#FCD34D",
    dark: "#FCD34D",
  },
  peachText: {
    light: "#6C4221",
    dark: "#382A22",
  },
  ivory: {
    light: "#FFFDF9",
    dark: "#0C0314",
  },
  danger: {
    light: "#D9534F",
    dark: "#EF4444",
  },
  dangerSurface: {
    light: "#FEF2F2",
    dark: "#2B1116",
  },
  dangerEdge: {
    light: "#FCA5A5",
    dark: "#521D25",
  },
  dangerText: {
    light: "#B91C1C",
    dark: "#FCA5A5",
  },
  success: {
    light: "#065F46",
    dark: "#10B981",
  },
  successSurface: {
    light: "#D1FAE5",
    dark: "#0E281E",
  },
  successEdge: {
    light: "#A7F3D0",
    dark: "#164E35",
  },
  successText: {
    light: "#065F46",
    dark: "#A7F3D0",
  },
  warn: {
    light: "#713F12",
    dark: "#FBBF24",
  },
  warnSurface: {
    light: "#FEF08A",
    dark: "#2B1E0C",
  },
  warnEdge: {
    light: "#FDE68A",
    dark: "#523916",
  },
  warnText: {
    light: "#713F12",
    dark: "#FDE68A",
  },
  lavender: {
    light: "#FCE7F3",
    dark: "#2B143D",
  },
  lavenderText: {
    light: "#831843",
    dark: "#F5D0FE",
  },
  skymist: {
    light: "#E0F2FE",
    dark: "#102138",
  },
  skymistText: {
    light: "#1E4868",
    dark: "#BAE6FD",
  },
} as const;

export const PAPER_COLORS = {
  parchment: {
    ink: "#2D2522",
    base: "#F5ECD8",
    edge: "#EBE3D5",
  },
  midnight: {
    ink: "#E5BC8B",
    base: "#1A1721",
    edge: "#3D334D",
  },
  rose: {
    ink: "#422835",
    base: "#F8EBEA",
    edge: "#E8DEF8",
  },
  typewriter: {
    ink: "#28241D",
    base: "#F3EBD9",
    edge: "#EBE3D5",
  },
  rainy: {
    ink: "#E2E8F0",
    base: "#202730",
    edge: "#E0F2FE",
  },
  starry: {
    ink: "#2E2A55",
    base: "#F3EDDC",
    edge: "#DDD3B8",
  },
  blossom: {
    ink: "#5B2333",
    base: "#FBF1EC",
    edge: "#F3D9D2",
  },
} as const;
