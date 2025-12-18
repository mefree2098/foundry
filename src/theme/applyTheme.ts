import type { SiteConfig } from "../lib/types";
import type { ThemeId } from "./themes";
import { themes } from "./themes";

const defaultThemeId: ThemeId = "theme1";

function isThemeId(value: unknown): value is ThemeId {
  return value === "theme1" || value === "theme2";
}

export function applyThemeFromConfig(config: SiteConfig | undefined) {
  const root = document.documentElement;
  const active = isThemeId(config?.theme?.active) ? (config?.theme?.active as ThemeId) : defaultThemeId;
  const base = themes[active].vars;
  const overrides = (config?.theme?.overrides && (config.theme.overrides[active] as Record<string, string> | undefined)) || {};

  root.dataset.theme = active;
  for (const [key, value] of Object.entries(base)) {
    root.style.setProperty(key, value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    root.style.setProperty(key, value);
  }

  // Back-compat: allow the older palette fields to override brand colors.
  if (config?.palette?.primary) root.style.setProperty("--color-primary", config.palette.primary);
  if (config?.palette?.secondary) root.style.setProperty("--color-secondary", config.palette.secondary);
  if (config?.palette?.background) root.style.setProperty("--color-bg", config.palette.background);
  if (config?.palette?.text) root.style.setProperty("--color-text", config.palette.text);
}

