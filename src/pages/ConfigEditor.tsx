import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchConfig, fetchPlatforms, fetchTopics, requestUploadSas, saveConfig } from "../lib/api";
import { ErrorState, Loading } from "../components/Loading";
import SectionCard from "../components/SectionCard";
import type { SiteConfig } from "../lib/types";
import { applyThemeFromConfig } from "../theme/applyTheme";
import { themes, type ThemeId } from "../theme/themes";

const defaults: SiteConfig = {
  id: "global",
  palette: { primary: "#005b50", secondary: "#50c878" },
  heroBadges: [],
  theme: { active: "theme1", overrides: {} },
};

type ThemeVar = { key: string; label: string; kind: "color" | "text" };

const themeVars: ThemeVar[] = [
  { key: "--color-bg", label: "Background", kind: "color" },
  { key: "--color-text", label: "Text", kind: "color" },
  { key: "--color-primary", label: "Primary", kind: "color" },
  { key: "--color-secondary", label: "Secondary", kind: "color" },
  { key: "--color-accent", label: "Accent", kind: "color" },
  { key: "--panel-grad-from", label: "Panel gradient from", kind: "color" },
  { key: "--panel-grad-to", label: "Panel gradient to", kind: "color" },
  { key: "--panel-border", label: "Panel border", kind: "text" },
  { key: "--btn-primary-bg", label: "Primary button bg", kind: "color" },
  { key: "--btn-primary-text", label: "Primary button text", kind: "color" },
  { key: "--btn-primary-border", label: "Primary button border", kind: "text" },
  { key: "--btn-secondary-bg", label: "Secondary button bg", kind: "text" },
  { key: "--btn-secondary-text", label: "Secondary button text", kind: "color" },
  { key: "--input-bg", label: "Input bg", kind: "text" },
  { key: "--input-border", label: "Input border", kind: "text" },
  { key: "--input-focus-ring", label: "Input focus ring", kind: "text" },
];

function isHexColor(value: string) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function coerceThemeId(value: unknown): ThemeId {
  return value === "theme2" ? "theme2" : "theme1";
}

function ConfigEditor() {
  const { data: config, isLoading, isError } = useQuery({ queryKey: ["config"], queryFn: fetchConfig });
  const { data: platforms = [] } = useQuery({ queryKey: ["platforms"], queryFn: fetchPlatforms });
  const { data: topics = [] } = useQuery({ queryKey: ["topics"], queryFn: fetchTopics });
  const [form, setForm] = useState<SiteConfig>(defaults);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const mutation = useMutation({ mutationFn: saveConfig });

  useEffect(() => {
    if (config) setForm({ ...defaults, ...config });
  }, [config]);

  useEffect(() => {
    applyThemeFromConfig(form);
  }, [form]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const activeTheme = coerceThemeId(form.theme?.active);
  const activeOverrides = (form.theme?.overrides && (form.theme.overrides[activeTheme] as Record<string, string> | undefined)) || {};
  const baseVars = themes[activeTheme].vars;

  const setThemeActive = (next: ThemeId) => {
    setForm((prev) => ({
      ...prev,
      theme: {
        active: next,
        overrides: prev.theme?.overrides || {},
      },
    }));
  };

  const setThemeVar = (key: string, value: string) => {
    setForm((prev) => {
      const prevTheme = prev.theme || { active: activeTheme, overrides: {} };
      const overrides = prevTheme.overrides || {};
      const current = (overrides[activeTheme] as Record<string, string> | undefined) || {};
      const nextCurrent = { ...current };
      if (value.trim()) nextCurrent[key] = value;
      else delete nextCurrent[key];
      return {
        ...prev,
        theme: {
          active: prevTheme.active,
          overrides: {
            ...overrides,
            [activeTheme]: nextCurrent,
          },
        },
      };
    });
  };

  const resetThemeOverrides = () => {
    setForm((prev) => {
      const prevTheme = prev.theme || { active: activeTheme, overrides: {} };
      const overrides = { ...(prevTheme.overrides || {}) };
      delete overrides[activeTheme];
      return { ...prev, theme: { active: prevTheme.active, overrides } };
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
                <div className="text-xs text-slate-300">Theme 1 preserves the current look. Theme 2 uses emerald gradient panels and black buttons.</div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="input-field max-w-[260px]"
                  value={activeTheme}
                  onChange={(e) => setThemeActive((e.target.value as ThemeId) || "theme1")}
                >
                  <option value="theme1">Theme 1 (Glass)</option>
                  <option value="theme2">Theme 2 (Emerald Panels + Black Buttons)</option>
                </select>
                <button type="button" className="btn btn-secondary" onClick={resetThemeOverrides}>
                  Reset overrides
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {themeVars.map((v) => {
                const val = activeOverrides[v.key] || "";
                const effective = val || baseVars[v.key] || "";
                const showColor = v.kind === "color" && isHexColor(effective);
                const colorValue = isHexColor(val) ? val : isHexColor(effective) ? effective : "#000000";
                return (
                  <label key={v.key} className="grid gap-1">
                    <span className="text-xs text-slate-300">{v.label}</span>
                    <div className="flex items-center gap-2">
                      {showColor ? (
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
                        value={val}
                        onChange={(e) => setThemeVar(v.key, e.target.value)}
                      />
                    </div>
                  </label>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Tip: For color pickers, enter a hex value like <code className="text-slate-200">#00ff99</code>. For gradients/rgba, use the text box.
            </p>
          </div>

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
          <input
            className="input-field"
            placeholder="Footer tagline"
            value={form.footerTagline || ""}
            onChange={(e) => setForm({ ...form, footerTagline: e.target.value })}
          />
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
