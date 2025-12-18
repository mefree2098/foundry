import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ntr: {
          emerald: "#005B50",
          "emerald-bright": "#50C878",
          magenta: "#FF007F",
          charcoal: "#0B1120",
          "slate-ink": "#0F172A",
        },
        brand: {
          primary: "var(--color-primary)",
          secondary: "var(--color-secondary)",
          accent: "var(--color-accent)",
          surface: "var(--color-surface)",
          muted: "var(--color-muted)",
        },
      },
      fontFamily: {
        heading: ["Inter", "Sora", "system-ui", "-apple-system", "sans-serif"],
        body: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        glass: "0 25px 50px -12px rgba(15, 23, 42, 0.45)",
      },
    },
  },
  plugins: [],
} satisfies Config;
