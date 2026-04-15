import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./stores/**/*.{ts,tsx}",
  ],
  safelist: [
    "bg-status-identified",
    "bg-status-researched",
    "bg-status-contacted",
    "bg-status-following",
    "bg-status-won",
  ],
  theme: {
    extend: {
      colors: {
        "rs-bg": "#100726",
        "rs-surface": "#1a0f45",
        "rs-surface-2": "#25145f",
        "rs-gold": "#64f5ea",
        "rs-gold-dark": "#34ddd2",
        "rs-border": "#49308c",
        "rs-punch": "#ff4f9f",
        "rs-sunset": "#ffb321",
        "rs-cream": "#fff4e8",
        "status-identified": "#6f64a8",
        "status-researched": "#4d8cff",
        "status-contacted": "#ffb321",
        "status-following": "#ff7c70",
        "status-won": "#44d39f",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
