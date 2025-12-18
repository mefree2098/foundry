import type { SiteConfig } from "../lib/types";
import { themes } from "./themes";

const defaultThemeId = "theme1";

export function applyThemeFromConfig(config: SiteConfig | undefined) {
  const root = document.documentElement;
  const active = (config?.theme?.active || defaultThemeId).trim() || defaultThemeId;

  const builtIn = themes as Record<string, { vars: Record<string, string> }>;
  const fromConfig = (config?.theme?.themes || []).find((t) => t.id === active);
  const defaults = (builtIn[active] && builtIn[active].vars) || themes.theme1.vars;
  const baseVars = (fromConfig && fromConfig.vars) || {};
  const legacyOverrides = (config?.theme?.overrides && (config.theme.overrides[active] as Record<string, string> | undefined)) || {};

  root.dataset.theme = active;
  for (const [key, value] of Object.entries(defaults)) {
    root.style.setProperty(key, value);
  }
  for (const [key, value] of Object.entries(baseVars)) {
    root.style.setProperty(key, value);
  }
  for (const [key, value] of Object.entries(legacyOverrides)) {
    root.style.setProperty(key, value);
  }

  // Back-compat: allow the older palette fields to override brand colors.
  if (config?.palette?.primary) root.style.setProperty("--color-primary", config.palette.primary);
  if (config?.palette?.secondary) root.style.setProperty("--color-secondary", config.palette.secondary);
  if (config?.palette?.background) root.style.setProperty("--color-bg", config.palette.background);
  if (config?.palette?.text) root.style.setProperty("--color-text", config.palette.text);
}
