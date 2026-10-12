import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        surface: {
          DEFAULT: "var(--surface)",
          raised: "var(--surface-raised)",
        },
        edge: {
          DEFAULT: "var(--edge)",
          subtle: "var(--edge-subtle)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          heading: "var(--ink-heading)",
          muted: "var(--ink-muted)",
          faint: "var(--ink-faint)",
        },
        wax: {
          DEFAULT: "var(--wax)",
          dim: "var(--wax-dim)",
        },
        gold: {
          DEFAULT: "var(--gold)",
          dim: "var(--gold-dim)",
        },
        peach: {
          DEFAULT: "var(--peach)",
          hover: "var(--peach-hover)",
          text: "var(--peach-text)",
        },
        ivory: "var(--ivory)",
        danger: {
          DEFAULT: "var(--danger)",
          surface: "var(--danger-surface)",
          edge: "var(--danger-edge)",
          text: "var(--danger-text)",
        },
        success: {
          DEFAULT: "var(--success)",
          surface: "var(--success-surface)",
          edge: "var(--success-edge)",
          text: "var(--success-text)",
        },
        warn: {
          DEFAULT: "var(--warn)",
          surface: "var(--warn-surface)",
          edge: "var(--warn-edge)",
          text: "var(--warn-text)",
        },
        lavender: {
          DEFAULT: "var(--lavender)",
          text: "var(--lavender-text)",
        },
        skymist: {
          DEFAULT: "var(--skymist)",
          text: "var(--skymist-text)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
          foreground: "var(--primary-foreground)",
        },
        stationery: {
          canvas: "var(--stationery-canvas)",
          card: "var(--stationery-card)",
          border: "var(--stationery-border)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", '"Hind Siliguri"', '"Noto Serif Bengali"', "serif"],
        ui: ["var(--font-ui)", '"Hind Siliguri"', '"Noto Serif Bengali"', "sans-serif"],
        hand: ["var(--font-hand)", '"Hind Siliguri"', '"Noto Serif Bengali"', "cursive", "sans-serif"],
        username: ["var(--font-username)", '"Hind Siliguri"', '"Noto Serif Bengali"', "cursive"],
        calligraphy: ["var(--font-calligraphy)", '"Hind Siliguri"', '"Noto Serif Bengali"', "cursive", "sans-serif"],
        pencil: ["var(--font-pencil)", '"Hind Siliguri"', '"Noto Serif Bengali"', "cursive", "sans-serif"],
        typewriter: ["var(--font-typewriter)", '"Hind Siliguri"', '"Noto Serif Bengali"', "monospace"],
        "mono-paper": ["var(--font-mono-paper)", '"Hind Siliguri"', '"Noto Serif Bengali"', "monospace"],
        "bn-ui": ["var(--font-bn-ui)", '"Hind Siliguri"', '"Noto Serif Bengali"', "sans-serif"],
        "bn-paper": ["var(--font-bn-paper)", '"Noto Serif Bengali"', '"Hind Siliguri"', "serif"],
        "bn-hand-1": ["var(--font-bn-hand-1)", '"Hind Siliguri"', '"Noto Serif Bengali"', "cursive", "sans-serif"],
        "bn-hand-2": ["var(--font-bn-hand-2)", '"Hind Siliguri"', '"Noto Serif Bengali"', "cursive", "sans-serif"],
        "bn-hand-3": ["var(--font-bn-hand-3)", '"Hind Siliguri"', '"Noto Serif Bengali"', "cursive", "sans-serif"],
      },
      borderRadius: {
        input: "1rem",
        btn: "9999px",
        card: "1.5rem",
        envelope: "1.75rem",
      },
      boxShadow: {
        modal: "0 20px 48px -16px rgba(70, 48, 32, 0.12)",
        hairline: "0 1px 0 rgba(240, 226, 210, 0.6) inset",
        stationery: "0 12px 32px -8px rgba(70, 48, 32, 0.08)",
        "stationery-card": "0 12px 32px -8px rgba(70, 48, 32, 0.08), 0 2px 8px rgba(70, 48, 32, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
