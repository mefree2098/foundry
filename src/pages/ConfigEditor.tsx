import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchConfig, fetchPlatforms, fetchTopics, requestUploadSas, saveConfig } from "../lib/api";
import { ErrorState, Loading } from "../components/Loading";
import SectionCard from "../components/SectionCard";
import type { SiteConfig } from "../lib/types";
import { applyThemeFromConfig } from "../theme/applyTheme";
import { themes, type ThemeDefinition } from "../theme/themes";

const defaults: SiteConfig = {
  id: "global",
  siteName: "Foundry",
  palette: { primary: "#005b50", secondary: "#50c878" },
  heroBadges: [],
  theme: { active: "theme1", themes: [themes.theme1, themes.theme2] },
  nav: {
    links: [
      { id: "home", label: "Home", href: "/" },
      { id: "platforms", label: "Platforms", href: "/platforms" },
      { id: "news", label: "News", href: "/news" },
      { id: "topics", label: "Topics", href: "/topics" },
      { id: "subscribe", label: "Subscribe", href: "/subscribe" },
      { id: "about", label: "About", href: "/about" },
      { id: "admin", label: "Admin", href: "/admin" },
    ],
  },
};

type ThemeVar = { key: string; label: string; kind: "color" | "text" };
type NavLink = NonNullable<NonNullable<SiteConfig["nav"]>["links"]>[number];

const themeVars: ThemeVar[] = [
  { key: "--color-bg", label: "Background", kind: "color" },
  { key: "--color-text", label: "Text", kind: "color" },
  { key: "--color-primary", label: "Primary", kind: "color" },
  { key: "--color-secondary", label: "Secondary", kind: "color" },
  { key: "--color-accent", label: "Accent", kind: "color" },
  { key: "--panel-grad-from", label: "Panel gradient from", kind: "color" },
  { key: "--panel-grad-to", label: "Panel gradient to", kind: "color" },
  { key: "--panel-border", label: "Panel border", kind: "color" },
  { key: "--btn-primary-bg", label: "Primary button bg", kind: "color" },
  { key: "--btn-primary-bg-hover", label: "Primary button bg hover", kind: "color" },
  { key: "--btn-primary-text", label: "Primary button text", kind: "color" },
  { key: "--btn-primary-border", label: "Primary button border", kind: "color" },
  { key: "--btn-secondary-bg", label: "Secondary button bg", kind: "color" },
  { key: "--btn-secondary-bg-hover", label: "Secondary button bg hover", kind: "color" },
  { key: "--btn-secondary-text", label: "Secondary button text", kind: "color" },
  { key: "--btn-secondary-border", label: "Secondary button border", kind: "color" },
  { key: "--input-bg", label: "Input bg", kind: "color" },
  { key: "--input-border", label: "Input border", kind: "color" },
  { key: "--input-text", label: "Input text", kind: "color" },
  { key: "--input-placeholder", label: "Input placeholder", kind: "color" },
  { key: "--input-focus-ring", label: "Input focus ring", kind: "color" },
  { key: "--dropdown-bg", label: "Dropdown bg", kind: "color" },
  { key: "--dropdown-text", label: "Dropdown text", kind: "color" },
];

function isHexColor(value: string) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function clamp255(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHexByte(n: number) {
  return clamp255(n).toString(16).padStart(2, "0");
}

function parseCssColorToHex(value: string): string | null {
  const v = (value || "").trim();
  if (!v) return null;
  if (isHexColor(v)) return v.toLowerCase();
  const hex6 = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(v);
  if (hex6) return `#${hex6[1].toLowerCase()}`;
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(v);
  if (rgb) return `#${toHexByte(Number(rgb[1]))}${toHexByte(Number(rgb[2]))}${toHexByte(Number(rgb[3]))}`;
  const rgba =
    /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|0?\.\d+|1(\.0+)?)\s*\)$/i.exec(v);
  if (rgba) return `#${toHexByte(Number(rgba[1]))}${toHexByte(Number(rgba[2]))}${toHexByte(Number(rgba[3]))}`;
  return null;
}

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureUniqueId(existingIds: Set<string>, base: string) {
  let next = base;
  let i = 2;
  while (existingIds.has(next)) {
    next = `${base}-${i}`;
    i += 1;
  }
  return next;
}

function moveItem<T>(arr: T[], from: number, to: number) {
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

function getThemeList(config: SiteConfig): ThemeDefinition[] {
  const list = (config.theme?.themes || []).filter((t) => t && t.id && t.name && t.vars);
  if (list.length) return list as ThemeDefinition[];
  return [themes.theme1, themes.theme2];
}

function ConfigEditor() {
  const { data: config, isLoading, isError } = useQuery({ queryKey: ["config"], queryFn: fetchConfig });
  const { data: platforms = [] } = useQuery({ queryKey: ["platforms"], queryFn: fetchPlatforms });
  const { data: topics = [] } = useQuery({ queryKey: ["topics"], queryFn: fetchTopics });
  const [form, setForm] = useState<SiteConfig>(defaults);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const mutation = useMutation({ mutationFn: saveConfig });
  const [newThemeName, setNewThemeName] = useState("");
  const [newThemeBase, setNewThemeBase] = useState<"theme1" | "theme2" | "current">("theme2");

  useEffect(() => {
    if (!config) return;

    const merged = { ...defaults, ...config } as SiteConfig;
    const active = (merged.theme?.active || "theme1").trim() || "theme1";
    const incomingThemes = (merged.theme?.themes || []) as ThemeDefinition[];

    let nextThemes: ThemeDefinition[];
    if (incomingThemes.length) {
      nextThemes = incomingThemes;
    } else {
      const legacyOverrides = (merged.theme?.overrides || {}) as Record<string, Record<string, string> | undefined>;
      const t1 = { ...themes.theme1, vars: { ...themes.theme1.vars, ...(legacyOverrides.theme1 || {}) } };
      const t2 = { ...themes.theme2, vars: { ...themes.theme2.vars, ...(legacyOverrides.theme2 || {}) } };
      nextThemes = [t1, t2];
    }

    setForm({
      ...merged,
      theme: {
        ...(merged.theme || {}),
        active,
        themes: nextThemes,
      },
      nav: {
        links: merged.nav?.links?.length ? merged.nav.links : defaults.nav?.links,
      },
    });
  }, [config]);

  useEffect(() => {
    applyThemeFromConfig(form);
  }, [form]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const themeList = getThemeList(form);
  const activeThemeId = (form.theme?.active || themeList[0]?.id || "theme1").trim() || "theme1";
  const selected = themeList.find((t) => t.id === activeThemeId) || themeList[0] || themes.theme1;
  const builtInVars = (themes as Record<string, ThemeDefinition>)[activeThemeId]?.vars || themes.theme1.vars;
  const baseVars = { ...builtInVars, ...(selected.vars || {}) };

  const setThemeActive = (next: string) => {
    setForm((prev) => ({
      ...prev,
      theme: {
        ...(prev.theme || {}),
        active: next,
        themes: getThemeList(prev),
      },
    }));
  };

  const setThemeVar = (key: string, value: string) => {
    setForm((prev) => {
      const list = getThemeList(prev).map((t) => ({ ...t, vars: { ...(t.vars || {}) } }));
      const idx = list.findIndex((t) => t.id === activeThemeId);
      if (idx === -1) return prev;
      const nextVars = { ...(list[idx].vars || {}) };
      if (value.trim()) nextVars[key] = value;
      else delete nextVars[key];
      list[idx] = { ...list[idx], vars: nextVars };
      return {
        ...prev,
        theme: {
          ...(prev.theme || {}),
          active: activeThemeId,
          themes: list,
        },
      };
    });
  };

  const resetThemeToTemplate = (template: "theme1" | "theme2") => {
    setForm((prev) => {
      const list = getThemeList(prev).map((t) => ({ ...t }));
      const idx = list.findIndex((t) => t.id === activeThemeId);
      if (idx === -1) return prev;
      list[idx] = { ...list[idx], vars: { ...(themes[template].vars as Record<string, string>) } };
      return { ...prev, theme: { ...(prev.theme || {}), active: activeThemeId, themes: list } };
    });
  };

  const createTheme = () => {
    const name = newThemeName.trim();
    if (!name) return;
    setForm((prev) => {
      const list = getThemeList(prev).map((t) => ({ ...t, vars: { ...(t.vars || {}) } }));
      const existingIds = new Set(list.map((t) => t.id));
      const slug = slugify(name) || "theme";
      const id = ensureUniqueId(existingIds, `theme-${slug}`);

      const base =
        newThemeBase === "current"
          ? { ...baseVars }
          : { ...(themes[newThemeBase].vars as Record<string, string>) };

      const nextTheme: ThemeDefinition = { id, name, vars: base };
      return { ...prev, theme: { ...(prev.theme || {}), active: id, themes: [...list, nextTheme] } };
    });
    setNewThemeName("");
    setNewThemeBase("theme2");
  };

  const renameTheme = (themeId: string) => {
    const current = themeList.find((t) => t.id === themeId);
    const nextName = prompt("Theme name:", current?.name || "");
    if (!nextName) return;
    setForm((prev) => {
      const list = getThemeList(prev).map((t) => (t.id === themeId ? { ...t, name: nextName.trim() } : t));
      return { ...prev, theme: { ...(prev.theme || {}), themes: list } };
    });
  };

  const deleteTheme = (themeId: string) => {
    if (themeList.length <= 1) return;
    if (!confirm(`Delete theme \"${themeId}\"?`)) return;
    setForm((prev) => {
      const list = getThemeList(prev).filter((t) => t.id !== themeId);
      if (list.length === 0) return prev;
      const active = (prev.theme?.active || list[0].id).trim() || list[0].id;
      const nextActive = active === themeId ? list[0].id : active;
      return { ...prev, theme: { ...(prev.theme || {}), active: nextActive, themes: list } };
    });
  };

  const navLinks = form.nav?.links || [];

  const addNavLink = () => {
    setForm((prev) => {
      const links = [...(prev.nav?.links || [])];
      const ids = new Set(links.map((l) => l.id));
      const id = ensureUniqueId(ids, "new-link");
      links.push({ id, label: "New link", href: "/", enabled: true });
      return { ...prev, nav: { ...(prev.nav || {}), links } };
    });
  };

  const updateNavLink = (idx: number, patch: Partial<NavLink>) => {
    setForm((prev) => {
      const links = [...(prev.nav?.links || [])];
      links[idx] = { ...links[idx], ...patch };
      return { ...prev, nav: { ...(prev.nav || {}), links } };
    });
  };

  const removeNavLink = (idx: number) => {
    setForm((prev) => {
      const links = [...(prev.nav?.links || [])];
      links.splice(idx, 1);
      return { ...prev, nav: { ...(prev.nav || {}), links } };
    });
  };

  const moveNavLink = (idx: number, dir: -1 | 1) => {
    setForm((prev) => {
      const links = [...(prev.nav?.links || [])];
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= links.length) return prev;
      return { ...prev, nav: { ...(prev.nav || {}), links: moveItem(links, idx, nextIdx) } };
    });
  };

  const normalizeNavIds = () => {
    setForm((prev) => {
      const links = [...(prev.nav?.links || [])];
      const ids = new Set<string>();
      const next = links.map((l) => {
        const base = slugify(l.id || l.label || "link") || "link";
        const id = ensureUniqueId(ids, base);
        ids.add(id);
        return { ...l, id };
      });
      return { ...prev, nav: { ...(prev.nav || {}), links: next } };
    });
  };

  return (
    <SectionCard title="Theme & Config">
      {isLoading ? (
        <Loading label="Loading config..." />
      ) : isError ? (
        <ErrorState />
      ) : (
        <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSubmit}>
          <div className="col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Theme</div>
                <div className="text-xs text-slate-300">Create, rename, delete themes. The active theme applies immediately while you edit.</div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="input-field max-w-[260px]"
                  value={activeThemeId}
                  onChange={(e) => setThemeActive(e.target.value)}
                >
                  {themeList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-secondary" onClick={() => resetThemeToTemplate("theme1")}>
                  Reset to Theme 1
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => resetThemeToTemplate("theme2")}>
                  Reset to Theme 2
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => renameTheme(activeThemeId)}>
                  Rename
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={themeList.length <= 1}
                  onClick={() => deleteTheme(activeThemeId)}
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="mb-4 grid gap-2 md:grid-cols-[1fr_240px_auto]">
              <input
                className="input-field"
                placeholder="New theme name"
                value={newThemeName}
                onChange={(e) => setNewThemeName(e.target.value)}
              />
              <select className="input-field" value={newThemeBase} onChange={(e) => setNewThemeBase(e.target.value as any)}>
                <option value="theme1">Use Theme 1 template</option>
                <option value="theme2">Use Theme 2 template</option>
                <option value="current">Copy current theme</option>
              </select>
              <button type="button" className="btn btn-primary" onClick={createTheme} disabled={!newThemeName.trim()}>
                Create
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {themeVars.map((v) => {
                const val = (selected.vars && selected.vars[v.key]) || "";
                const effective = val || baseVars[v.key] || "";
                const showColorPicker = v.kind === "color";
                const colorValue =
                  parseCssColorToHex(val) || parseCssColorToHex(effective) || "#000000";
                return (
                  <label key={v.key} className="grid gap-1">
                    <span className="text-xs text-slate-300">{v.label}</span>
                    <div className="flex items-center gap-2">
                      {showColorPicker ? (
                        <input
                          type="color"
                          value={colorValue}
                          onChange={(e) => setThemeVar(v.key, e.target.value)}
                          className="h-10 w-12 cursor-pointer rounded border border-white/10 bg-transparent"
                        />
                      ) : null}
                      <input
                        className="input-field"
                        placeholder={v.key}
                        value={val || ""}
                        onChange={(e) => setThemeVar(v.key, e.target.value)}
                      />
                    </div>
                  </label>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Tip: Use the picker for quick selection; use the text box for precise values (hex/rgba/var()).
            </p>
          </div>

          <input
            className="input-field"
            placeholder="Site name"
            value={form.siteName || ""}
            onChange={(e) => setForm({ ...form, siteName: e.target.value })}
          />
          <input
            className="input-field"
            placeholder="Home tagline"
            value={form.homeTagline || ""}
            onChange={(e) => setForm({ ...form, homeTagline: e.target.value })}
          />
          <input
            className="input-field"
            placeholder="Hero title"
            value={form.heroTitle || ""}
            onChange={(e) => setForm({ ...form, heroTitle: e.target.value })}
          />
          <textarea
            className="input-field col-span-2 min-h-[80px]"
            placeholder="Hero subtitle"
            value={form.heroSubtitle || ""}
            onChange={(e) => setForm({ ...form, heroSubtitle: e.target.value })}
          />
          <textarea
            className="input-field col-span-2 min-h-[60px]"
            placeholder="Hero badges (one per line)"
            value={(form.heroBadges || []).join("\n")}
            onChange={(e) => setForm({ ...form, heroBadges: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
          <input
            className="input-field"
            placeholder="Hero CTA text"
            value={form.heroCtaText || ""}
            onChange={(e) => setForm({ ...form, heroCtaText: e.target.value })}
          />
          <input
            className="input-field"
            placeholder="Hero CTA URL"
            value={form.heroCtaUrl || ""}
            onChange={(e) => setForm({ ...form, heroCtaUrl: e.target.value })}
          />
          <input
            className="input-field"
            placeholder="Primary color"
            value={form.palette?.primary || ""}
            onChange={(e) =>
              setForm({
                ...form,
                palette: {
                  primary: e.target.value || defaults.palette?.primary || "#6ee7b7",
                  secondary: form.palette?.secondary,
                  background: form.palette?.background,
                  text: form.palette?.text,
                },
              })
            }
          />
          <input
            className="input-field"
            placeholder="Secondary color"
            value={form.palette?.secondary || ""}
            onChange={(e) =>
              setForm({
                ...form,
                palette: {
                  primary: form.palette?.primary || defaults.palette?.primary || "#6ee7b7",
                  secondary: e.target.value,
                  background: form.palette?.background,
                  text: form.palette?.text,
                },
              })
            }
          />
          <input
            className="input-field"
            placeholder="Logo URL"
            value={form.logoUrl || ""}
            onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
          />
          <div className="col-span-2 flex flex-col gap-2">
            <label className="text-xs text-slate-300">Upload logo</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={uploadingLogo}
                className="btn btn-primary"
                onClick={() => document.getElementById("logo-upload")?.click()}
              >
                {uploadingLogo ? "Uploading..." : "Choose file"}
              </button>
              <span className="text-xs text-slate-300">{form.logoUrl ? "Image selected" : "No file chosen"}</span>
              {form.logoUrl && (
                <img
                  src={form.logoUrl}
                  alt="Logo preview"
                  className="h-10 w-10 rounded object-contain ring-1 ring-white/20 bg-transparent"
                />
              )}
              <input
                id="logo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    setUploadingLogo(true);
                    const sas = await requestUploadSas(file.name, file.type || "application/octet-stream");
                    await fetch(sas.uploadUrl, {
                      method: "PUT",
                      headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": file.type || "application/octet-stream" },
                      body: file,
                    });
                    setForm((prev) => ({ ...prev, logoUrl: sas.blobUrl }));
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Upload failed");
                    console.error(err);
                  } finally {
                    setUploadingLogo(false);
                    e.target.value = "";
                  }
                }}
            />
          </div>
          </div>
          <input
            className="input-field"
            placeholder="Footer tagline"
            value={form.footerTagline || ""}
            onChange={(e) => setForm({ ...form, footerTagline: e.target.value })}
          />

          <div className="col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Navigation</div>
                <div className="text-xs text-slate-300">Add, remove, rename, and reorder header links.</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="btn btn-secondary" onClick={normalizeNavIds}>
                  Normalize IDs
                </button>
                <button type="button" className="btn btn-secondary" onClick={addNavLink}>
                  Add link
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {navLinks.map((l, idx) => (
                <div key={l.id || idx} className="grid gap-2 md:grid-cols-[110px_1fr_2fr_90px_auto] items-center">
                  <label className="flex items-center gap-2 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={l.enabled ?? true}
                      onChange={(e) => updateNavLink(idx, { enabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                  <input
                    className="input-field"
                    placeholder="Label"
                    value={l.label || ""}
                    onChange={(e) => updateNavLink(idx, { label: e.target.value })}
                  />
                  <input
                    className="input-field"
                    placeholder="Href (/path or https://...)"
                    value={l.href || ""}
                    onChange={(e) => updateNavLink(idx, { href: e.target.value })}
                  />
                  <label className="flex items-center gap-2 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={l.newTab ?? false}
                      onChange={(e) => updateNavLink(idx, { newTab: e.target.checked })}
                    />
                    New tab
                  </label>
                  <div className="flex gap-2 justify-end">
                    <button type="button" className="btn btn-secondary" disabled={idx === 0} onClick={() => moveNavLink(idx, -1)}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={idx === navLinks.length - 1}
                      onClick={() => moveNavLink(idx, 1)}
                    >
                      ↓
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => removeNavLink(idx)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {navLinks.length === 0 ? <div className="text-xs text-slate-400">No links configured.</div> : null}
            </div>
          </div>

          <div className="col-span-2">
            <div className="text-xs text-slate-300 mb-2">Featured platforms</div>
            <div className="flex flex-wrap gap-2">
              {[...platforms].sort((a, b) => (a.name || "").localeCompare(b.name || "")).map((a) => (
                <label key={a.id} className="flex items-center gap-2 rounded border border-white/10 px-2 py-1 text-xs text-slate-100">
                  <input
                    type="checkbox"
                    checked={form.featuredPlatformIds?.includes(a.id) ?? false}
                    onChange={(e) => {
                      const current = form.featuredPlatformIds || [];
                      const next = e.target.checked ? [...current, a.id] : current.filter((id) => id !== a.id);
                      setForm({ ...form, featuredPlatformIds: next });
                    }}
                  />
                  {a.name || a.id}
                </label>
              ))}
              {platforms.length === 0 && <span className="text-slate-400">No platforms yet.</span>}
            </div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-slate-300 mb-2">Featured topics</div>
            <div className="flex flex-wrap gap-2">
              {[...topics].sort((a, b) => (a.name || "").localeCompare(b.name || "")).map((g) => (
                <label key={g.id} className="flex items-center gap-2 rounded border border-white/10 px-2 py-1 text-xs text-slate-100">
                  <input
                    type="checkbox"
                    checked={form.featuredTopicIds?.includes(g.id) ?? false}
                    onChange={(e) => {
                      const current = form.featuredTopicIds || [];
                      const next = e.target.checked ? [...current, g.id] : current.filter((id) => id !== g.id);
                      setForm({ ...form, featuredTopicIds: next });
                    }}
                  />
                  {g.name || g.id}
                </label>
              ))}
              {topics.length === 0 && <span className="text-slate-400">No topics yet.</span>}
            </div>
          </div>

          <div className="col-span-2 flex gap-3">
            <button
              type="submit"
              className="btn btn-primary"
            >
              Save config
            </button>
            {mutation.isSuccess && <span className="text-emerald-200">Saved.</span>}
            {mutation.isError && <ErrorState message="Save failed." />}
          </div>
        </form>
      )}
    </SectionCard>
  );
}

export default ConfigEditor;
