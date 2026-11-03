import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff5ff",
          100: "#dbe8ff",
          200: "#bcd5ff",
          300: "#8db7ff",
          400: "#5a91ff",
          500: "#2f6df6",
          600: "#2459d8",
          700: "#1e4ab3",
          800: "#1c3e8f",
          900: "#1b3670",
          950: "#111f42",
        },
        ink: {
          950: "#07090d",
          900: "#0b0e14",
          800: "#11151d",
          700: "#1a202b",
          600: "#262e3b",
        },
        paper: "#f7f8f9",
      },
      fontFamily: {
        sans: [
          "Inter Tight Variable",
          "Inter Tight",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        sm: "1px",
        DEFAULT: "2px",
        md: "2px",
        lg: "2px",
        xl: "3px",
        "2xl": "4px",
        "3xl": "6px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(11, 14, 20, 0.04), 0 1px 3px rgba(11, 14, 20, 0.08)",
        lift: "0 18px 48px -24px rgba(11, 14, 20, 0.3)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-line": {
          "0%, 100%": { opacity: "0.25" },
          "50%": { opacity: "0.9" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pulse-line": "pulse-line 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
