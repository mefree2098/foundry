export type ThemeDefinition = {
  id: string;
  name: string;
  vars: Record<string, string>;
};

export const themes: Record<"theme1" | "theme2", ThemeDefinition> = {
  theme1: {
    id: "theme1",
    name: "Theme 1 (Glass)",
    vars: {
      "--color-primary": "#005b50",
      "--color-secondary": "#50c878",
      "--color-accent": "#ff007f",
      "--color-muted": "#94a3b8",
      "--color-text": "#e2e8f0",
      "--color-bg": "#0b1120",

      "--bg-spot-1": "rgba(80, 200, 120, 0.14)",
      "--bg-spot-2": "rgba(0, 91, 80, 0.16)",
      "--bg-spot-3": "rgba(255, 0, 127, 0.12)",

      "--panel-grad-from": "rgba(0, 0, 0, 0)",
      "--panel-grad-to": "rgba(0, 0, 0, 0)",
      "--panel-bg": "rgba(255, 255, 255, 0.03)",
      "--panel-border": "rgba(255, 255, 255, 0.07)",
      "--panel-shadow": "0 25px 50px -12px rgba(15, 23, 42, 0.45), 0 0 45px rgba(0, 91, 80, 0.08)",
      "--panel-blur": "12px",

      "--input-bg": "rgba(255, 255, 255, 0.05)",
      "--input-border": "rgba(255, 255, 255, 0.10)",
      "--input-text": "var(--color-text)",
      "--input-placeholder": "rgba(148, 163, 184, 0.90)",
      "--input-focus-ring": "rgba(255, 0, 127, 0.50)",

      "--dropdown-bg": "#0b1120",
      "--dropdown-text": "var(--color-text)",

      "--btn-primary-bg": "#50c878",
      "--btn-primary-bg-hover": "#6be59a",
      "--btn-primary-text": "#06140f",
      "--btn-primary-border": "rgba(255, 255, 255, 0.05)",

      "--btn-secondary-bg": "rgba(255, 255, 255, 0.08)",
      "--btn-secondary-bg-hover": "rgba(255, 255, 255, 0.14)",
      "--btn-secondary-text": "var(--color-text)",
      "--btn-secondary-border": "rgba(255, 255, 255, 0.14)",
    },
  },
  theme2: {
    id: "theme2",
    name: "Theme 2 (Emerald Panels + Black Buttons)",
    vars: {
      "--color-primary": "#005b50",
      "--color-secondary": "#50c878",
      "--color-accent": "#ff007f",
      "--color-muted": "#94a3b8",
      "--color-text": "#e2e8f0",
      "--color-bg": "#000000",

      "--bg-spot-1": "rgba(0, 0, 0, 0)",
      "--bg-spot-2": "rgba(0, 0, 0, 0)",
      "--bg-spot-3": "rgba(0, 0, 0, 0)",

      "--panel-grad-from": "rgba(0, 91, 80, 0.42)",
      "--panel-grad-to": "rgba(0, 0, 0, 0.25)",
      "--panel-bg": "linear-gradient(145deg, var(--panel-grad-from), var(--panel-grad-to))",
      "--panel-border": "rgba(80, 200, 120, 0.22)",
      "--panel-shadow": "inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 35px 70px -22px rgba(0, 0, 0, 0.75), 0 0 55px rgba(0, 91, 80, 0.22)",
      "--panel-blur": "10px",

      "--input-bg": "rgba(0, 0, 0, 0.25)",
      "--input-border": "rgba(80, 200, 120, 0.18)",
      "--input-text": "var(--color-text)",
      "--input-placeholder": "rgba(148, 163, 184, 0.90)",
      "--input-focus-ring": "rgba(80, 200, 120, 0.35)",

      "--dropdown-bg": "#000000",
      "--dropdown-text": "var(--color-text)",

      "--btn-primary-bg": "#000000",
      "--btn-primary-bg-hover": "#0a0a0a",
      "--btn-primary-text": "var(--color-text)",
      "--btn-primary-border": "rgba(80, 200, 120, 0.40)",

      "--btn-secondary-bg": "rgba(0, 0, 0, 0.35)",
      "--btn-secondary-bg-hover": "rgba(0, 0, 0, 0.55)",
      "--btn-secondary-text": "var(--color-text)",
      "--btn-secondary-border": "rgba(255, 255, 255, 0.14)",
    },
  },
};
