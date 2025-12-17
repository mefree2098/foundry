import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchConfig, fetchPlatforms, fetchTopics, requestUploadSas, saveConfig } from "../lib/api";
import { ErrorState, Loading } from "../components/Loading";
import SectionCard from "../components/SectionCard";
import type { SiteConfig } from "../lib/types";

const defaults: SiteConfig = {
  id: "global",
  palette: { primary: "var(--color-primary)", secondary: "var(--color-secondary)" },
  heroBadges: [],
};

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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  return (
    <SectionCard title="Theme & Config">
      {isLoading ? (
        <Loading label="Loading config..." />
      ) : isError ? (
        <ErrorState />
      ) : (
        <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSubmit}>
          <input
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-slate-100"
            placeholder="Home tagline"
            value={form.homeTagline || ""}
            onChange={(e) => setForm({ ...form, homeTagline: e.target.value })}
          />
          <input
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-slate-100"
            placeholder="Hero title"
            value={form.heroTitle || ""}
            onChange={(e) => setForm({ ...form, heroTitle: e.target.value })}
          />
          <textarea
            className="col-span-2 min-h-[80px] rounded-md border border-white/10 bg-white/5 px-3 py-2 text-slate-100"
            placeholder="Hero subtitle"
            value={form.heroSubtitle || ""}
            onChange={(e) => setForm({ ...form, heroSubtitle: e.target.value })}
          />
          <textarea
            className="col-span-2 min-h-[60px] rounded-md border border-white/10 bg-white/5 px-3 py-2 text-slate-100"
            placeholder="Hero badges (one per line)"
            value={(form.heroBadges || []).join("\n")}
            onChange={(e) => setForm({ ...form, heroBadges: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
          <input
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-slate-100"
            placeholder="Hero CTA text"
            value={form.heroCtaText || ""}
            onChange={(e) => setForm({ ...form, heroCtaText: e.target.value })}
          />
          <input
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-slate-100"
            placeholder="Hero CTA URL"
            value={form.heroCtaUrl || ""}
            onChange={(e) => setForm({ ...form, heroCtaUrl: e.target.value })}
          />
          <input
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-slate-100"
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
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-slate-100"
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
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-slate-100"
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
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
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
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-slate-100"
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
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
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
