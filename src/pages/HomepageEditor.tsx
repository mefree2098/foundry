import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import SectionCard from "../components/SectionCard";
import { fetchConfig, saveConfig } from "../lib/api";
import type { SiteConfig } from "../lib/types";
import { AI_PROVIDERS } from "../lib/aiProviders";

type TrustCard = NonNullable<NonNullable<NonNullable<SiteConfig["home"]>["trustSection"]>["cards"]>[number];
type AiSectionProvider = NonNullable<NonNullable<NonNullable<SiteConfig["home"]>["aiSection"]>["providers"]>[number];
type HomeSection = NonNullable<NonNullable<NonNullable<SiteConfig["home"]>["sections"]>>[number];

const iconOptions = [
  { value: "", label: "None" },
  { value: "key", label: "Key" },
  { value: "shield", label: "Shield" },
  { value: "shuffle", label: "Shuffle" },
  { value: "KeyRound", label: "KeyRound" },
  { value: "ShieldCheck", label: "ShieldCheck" },
  { value: "Shuffle", label: "Shuffle" },
];

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureUniqueId(existing: Set<string>, base: string) {
  let next = base;
  let i = 2;
  while (existing.has(next)) {
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

const defaults: NonNullable<SiteConfig["home"]> = {
  sections: [
    { id: "trust", type: "trust", enabled: true },
    { id: "ai", type: "ai", enabled: true },
    { id: "platforms", type: "platforms", enabled: true, maxItems: 6, title: "Featured platforms" },
    { id: "news", type: "news", enabled: true, maxItems: 6, title: "Latest news" },
    { id: "topics", type: "topics", enabled: true, maxItems: 6, title: "Explore by topic" },
    { id: "newsletter", type: "newsletter", enabled: true },
  ],
  trustSection: {
    title: "Trust & control",
    cards: [
      {
        id: "bring-your-own-ai",
        title: "Bring your own AI",
        body: "Use the AI provider your organization prefers by supplying your own API key (no custom models, no lock-in).",
        icon: "key",
        iconColor: "var(--color-accent)",
      },
      {
        id: "keep-control-of-data",
        title: "Keep control of data",
        body: "Platforms are designed to fit your workflows while keeping your systems and policies at the center.",
        icon: "shield",
        iconColor: "var(--color-secondary)",
      },
      {
        id: "switch-when-you-need-to",
        title: "Switch when you need to",
        body: "Change providers as capabilities and pricing evolve-without rewriting the business platform around it.",
        icon: "shuffle",
        iconColor: "var(--color-accent)",
      },
    ],
  },
  aiSection: {
    title: "Bring your own AI",
    subtitle: "Foundry sites are AI-friendly by design, but we avoid lock-in. Use the AI provider your organization prefers by supplying your own API key.",
    footnote: "Examples shown; supported options can vary by platform.",
    providers: AI_PROVIDERS,
  },
};

function HomepageEditor() {
  const { data: config, isLoading, isError } = useQuery({ queryKey: ["config"], queryFn: fetchConfig });
  const mutation = useMutation({ mutationFn: saveConfig });

  const [home, setHome] = useState<SiteConfig["home"]>(defaults);
  const [newSectionType, setNewSectionType] = useState<string>("trust");
  const [newProviderPreset, setNewProviderPreset] = useState<string>(AI_PROVIDERS[0]?.id || "openai");

  useEffect(() => {
    if (!config) return;
    setHome({
      ...defaults,
      ...(config.home || {}),
      sections: config.home?.sections?.length ? config.home.sections : defaults.sections,
      trustSection: {
        ...(defaults.trustSection || {}),
        ...(config.home?.trustSection || {}),
        cards: config.home?.trustSection?.cards?.length ? config.home.trustSection.cards : defaults.trustSection?.cards,
      },
      aiSection: {
        ...(defaults.aiSection || {}),
        ...(config.home?.aiSection || {}),
        providers: config.home?.aiSection?.providers?.length ? config.home.aiSection.providers : defaults.aiSection?.providers,
      },
    });
  }, [config]);

  const trustCards = home?.trustSection?.cards || [];
  const aiProviders = home?.aiSection?.providers || [];
  const sections = home?.sections || [];

  const presetById = useMemo(() => Object.fromEntries(AI_PROVIDERS.map((p) => [p.id, p])), []);

  const save = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({ id: "global", home });
  };

  const updateSection = (idx: number, patch: Partial<HomeSection>) => {
    setHome((prev) => {
      const current = [...(prev?.sections || [])];
      current[idx] = { ...current[idx], ...patch } as HomeSection;
      return { ...prev, sections: current };
    });
  };

  const addSection = (type: string) => {
    const normalizedType = (type || "richText").trim() || "richText";
    setHome((prev) => {
      const current = [...(prev?.sections || [])];
      const ids = new Set(current.map((s) => s.id));
      const id = ensureUniqueId(ids, slugify(normalizedType) || "section");
      const base: any = { id, type: normalizedType, enabled: true };
      if (normalizedType === "richText") {
        base.title = "New section";
        base.markdown = "Edit this text.";
      } else if (normalizedType === "cta") {
        base.title = "Get started";
        base.subtitle = "Describe the call to action.";
        base.cta = { primaryText: "Learn more", primaryHref: "/about" };
      } else if (["platforms", "news", "topics"].includes(normalizedType.toLowerCase())) {
        base.title = normalizedType[0].toUpperCase() + normalizedType.slice(1);
        base.maxItems = 6;
      }
      current.push(base);
      return { ...prev, sections: current };
    });
  };

  const removeSection = (idx: number) => {
    setHome((prev) => {
      const current = [...(prev?.sections || [])];
      current.splice(idx, 1);
      return { ...prev, sections: current };
    });
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    setHome((prev) => {
      const current = [...(prev?.sections || [])];
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= current.length) return prev;
      return { ...prev, sections: moveItem(current, idx, nextIdx) };
    });
  };

  const normalizeSectionIds = () => {
    setHome((prev) => {
      const current = [...(prev?.sections || [])];
      const ids = new Set<string>();
      const next = current.map((s) => {
        const base = slugify(s.id || s.title || s.type || "section") || "section";
        const id = ensureUniqueId(ids, base);
        ids.add(id);
        return { ...s, id } as HomeSection;
      });
      return { ...prev, sections: next };
    });
  };

  const updateTrustCard = (idx: number, patch: Partial<TrustCard>) => {
    setHome((prev) => {
      const cards = [...(prev?.trustSection?.cards || [])];
      cards[idx] = { ...cards[idx], ...patch };
      return { ...prev, trustSection: { ...(prev?.trustSection || {}), cards } };
    });
  };

  const addTrustCard = () => {
    setHome((prev) => {
      const cards = [...(prev?.trustSection?.cards || [])];
      const ids = new Set(cards.map((c) => c.id));
      const id = ensureUniqueId(ids, "new-card");
      cards.push({ id, title: "New card", body: "Edit this text.", icon: "key", iconColor: "var(--color-accent)" });
      return { ...prev, trustSection: { ...(prev?.trustSection || {}), cards } };
    });
  };

  const removeTrustCard = (idx: number) => {
    setHome((prev) => {
      const cards = [...(prev?.trustSection?.cards || [])];
      cards.splice(idx, 1);
      return { ...prev, trustSection: { ...(prev?.trustSection || {}), cards } };
    });
  };

  const moveTrustCard = (idx: number, dir: -1 | 1) => {
    setHome((prev) => {
      const cards = [...(prev?.trustSection?.cards || [])];
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= cards.length) return prev;
      return { ...prev, trustSection: { ...(prev?.trustSection || {}), cards: moveItem(cards, idx, nextIdx) } };
    });
  };

  const updateAiProvider = (idx: number, patch: Partial<AiSectionProvider>) => {
    setHome((prev) => {
      const providers = [...(prev?.aiSection?.providers || [])];
      providers[idx] = { ...providers[idx], ...patch };
      return { ...prev, aiSection: { ...(prev?.aiSection || {}), providers } };
    });
  };

  const addPresetProvider = () => {
    const preset = presetById[newProviderPreset];
    if (!preset) return;
    setHome((prev) => {
      const providers = [...(prev?.aiSection?.providers || [])];
      const ids = new Set(providers.map((p) => p.id));
      const nextId = ensureUniqueId(ids, preset.id);
      providers.push({ ...preset, id: nextId });
      return { ...prev, aiSection: { ...(prev?.aiSection || {}), providers } };
    });
  };

  const addCustomProvider = () => {
    setHome((prev) => {
      const providers = [...(prev?.aiSection?.providers || [])];
      const ids = new Set(providers.map((p) => p.id));
      const id = ensureUniqueId(ids, "custom-provider");
      providers.push({ id, label: "Custom", icon: "" });
      return { ...prev, aiSection: { ...(prev?.aiSection || {}), providers } };
    });
  };

  const removeAiProvider = (idx: number) => {
    setHome((prev) => {
      const providers = [...(prev?.aiSection?.providers || [])];
      providers.splice(idx, 1);
      return { ...prev, aiSection: { ...(prev?.aiSection || {}), providers } };
    });
  };

  const moveAiProvider = (idx: number, dir: -1 | 1) => {
    setHome((prev) => {
      const providers = [...(prev?.aiSection?.providers || [])];
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= providers.length) return prev;
      return { ...prev, aiSection: { ...(prev?.aiSection || {}), providers: moveItem(providers, idx, nextIdx) } };
    });
  };

  const normalizeIds = () => {
    setHome((prev) => {
      const trust = prev?.trustSection?.cards || [];
      const ai = prev?.aiSection?.providers || [];

      const trustIds = new Set<string>();
      const nextTrust = trust.map((c) => {
        const base = slugify(c.id || c.title || "card") || "card";
        const id = ensureUniqueId(trustIds, base);
        trustIds.add(id);
        return { ...c, id };
      });

      const aiIds = new Set<string>();
      const nextAi = ai.map((p) => {
        const base = slugify(p.id || p.label || "provider") || "provider";
        const id = ensureUniqueId(aiIds, base);
        aiIds.add(id);
        return { ...p, id };
      });

      return {
        ...prev,
        trustSection: { ...(prev?.trustSection || {}), cards: nextTrust },
        aiSection: { ...(prev?.aiSection || {}), providers: nextAi },
      };
    });
  };

  return (
    <SectionCard title="Homepage content">
      {isLoading ? (
        <div className="text-sm text-slate-200">Loading…</div>
      ) : isError ? (
        <div className="text-sm text-red-200">Failed to load config.</div>
      ) : (
        <form className="space-y-6" onSubmit={save}>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Homepage sections</div>
                <div className="text-xs text-slate-300">Add/remove/reorder sections and configure titles.</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn btn-secondary" onClick={normalizeSectionIds}>
                  Normalize IDs
                </button>
                <select
                  className="input-field max-w-[240px]"
                  value={newSectionType}
                  onChange={(e) => setNewSectionType(e.target.value)}
                >
                  <option value="trust">Add: Trust</option>
                  <option value="ai">Add: AI</option>
                  <option value="platforms">Add: Platforms</option>
                  <option value="news">Add: News</option>
                  <option value="topics">Add: Topics</option>
                  <option value="newsletter">Add: Newsletter</option>
                  <option value="richText">Add: Rich text</option>
                  <option value="cta">Add: CTA</option>
                </select>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => addSection(newSectionType)}
                >
                  Add section
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-3">
              {sections.map((s, idx) => {
                const type = String(s.type || "");
                const isRichText = type.toLowerCase() === "richtext";
                const isCta = type.toLowerCase() === "cta";
                const needsCount = ["platforms", "news", "topics"].includes(type.toLowerCase());
                return (
                  <div key={s.id || idx} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-slate-200">
                          <input
                            type="checkbox"
                            checked={s.enabled ?? true}
                            onChange={(e) => updateSection(idx, { enabled: e.target.checked })}
                          />
                          Enabled
                        </label>
                        <div className="text-xs text-slate-300">
                          <span className="font-semibold text-slate-100">{type}</span> · <span className="text-slate-400">{s.id}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" className="btn btn-secondary" disabled={idx === 0} onClick={() => moveSection(idx, -1)}>
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={idx === sections.length - 1}
                          onClick={() => moveSection(idx, 1)}
                        >
                          ↓
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => removeSection(idx)}>
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <input
                        className="input-field"
                        placeholder="Title"
                        value={(s.title as string) || ""}
                        onChange={(e) => updateSection(idx, { title: e.target.value })}
                      />
                      <input
                        className="input-field"
                        placeholder="Subtitle (optional)"
                        value={(s.subtitle as string) || ""}
                        onChange={(e) => updateSection(idx, { subtitle: e.target.value })}
                      />

                      {needsCount ? (
                        <input
                          className="input-field"
                          type="number"
                          min={1}
                          max={24}
                          placeholder="Max items"
                          value={typeof s.maxItems === "number" ? s.maxItems : 6}
                          onChange={(e) => updateSection(idx, { maxItems: Number(e.target.value) || 6 })}
                        />
                      ) : null}

                      {isRichText ? (
                        <textarea
                          className="input-field md:col-span-2 min-h-[120px]"
                          placeholder="Text (supports line breaks)"
                          value={(s.markdown as string) || ""}
                          onChange={(e) => updateSection(idx, { markdown: e.target.value })}
                        />
                      ) : null}

                      {isCta ? (
                        <div className="md:col-span-2 grid gap-2 md:grid-cols-2">
                          <input
                            className="input-field"
                            placeholder="Primary button text"
                            value={(s.cta as any)?.primaryText || ""}
                            onChange={(e) =>
                              updateSection(idx, {
                                cta: { ...((s.cta as any) || {}), primaryText: e.target.value },
                              } as any)
                            }
                          />
                          <input
                            className="input-field"
                            placeholder="Primary href"
                            value={(s.cta as any)?.primaryHref || ""}
                            onChange={(e) =>
                              updateSection(idx, {
                                cta: { ...((s.cta as any) || {}), primaryHref: e.target.value },
                              } as any)
                            }
                          />
                          <input
                            className="input-field"
                            placeholder="Secondary button text"
                            value={(s.cta as any)?.secondaryText || ""}
                            onChange={(e) =>
                              updateSection(idx, {
                                cta: { ...((s.cta as any) || {}), secondaryText: e.target.value },
                              } as any)
                            }
                          />
                          <input
                            className="input-field"
                            placeholder="Secondary href"
                            value={(s.cta as any)?.secondaryHref || ""}
                            onChange={(e) =>
                              updateSection(idx, {
                                cta: { ...((s.cta as any) || {}), secondaryHref: e.target.value },
                              } as any)
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {sections.length === 0 ? <div className="text-xs text-slate-400">No homepage sections configured.</div> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Trust & control section</div>
                <div className="text-xs text-slate-300">Edit the section title and manage cards (add/remove/reorder).</div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary" onClick={normalizeIds}>
                  Normalize IDs
                </button>
                <button type="button" className="btn btn-secondary" onClick={addTrustCard}>
                  Add card
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <input
                className="input-field md:col-span-2"
                placeholder="Section title"
                value={home?.trustSection?.title || ""}
                onChange={(e) => setHome((prev) => ({ ...prev, trustSection: { ...(prev?.trustSection || {}), title: e.target.value } }))}
              />
              {trustCards.map((c, idx) => (
                <div key={c.id || idx} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-300">Card {idx + 1}</div>
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-secondary" disabled={idx === 0} onClick={() => moveTrustCard(idx, -1)}>
                        Up
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={idx === trustCards.length - 1}
                        onClick={() => moveTrustCard(idx, 1)}
                      >
                        Down
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => removeTrustCard(idx)}>
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2">
                    <input
                      className="input-field"
                      placeholder="id (slug)"
                      value={c.id}
                      onChange={(e) => updateTrustCard(idx, { id: e.target.value })}
                    />
                    <input
                      className="input-field"
                      placeholder="Title"
                      value={c.title}
                      onChange={(e) => updateTrustCard(idx, { title: e.target.value })}
                    />
                    <textarea
                      className="input-field min-h-[84px]"
                      placeholder="Body"
                      value={c.body}
                      onChange={(e) => updateTrustCard(idx, { body: e.target.value })}
                    />
                    <div className="grid gap-2 md:grid-cols-2">
                      <select
                        className="input-field"
                        value={c.icon || ""}
                        onChange={(e) => updateTrustCard(idx, { icon: e.target.value || undefined })}
                      >
                        {iconOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input-field"
                        placeholder="Icon color (e.g. var(--color-accent) or #50c878)"
                        value={c.iconColor || ""}
                        onChange={(e) => updateTrustCard(idx, { iconColor: e.target.value || undefined })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Bring your own AI section</div>
                <div className="text-xs text-slate-300">Edit text and manage provider tiles (add preset/custom, edit, reorder).</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select className="input-field max-w-[220px]" value={newProviderPreset} onChange={(e) => setNewProviderPreset(e.target.value)}>
                  {AI_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-secondary" onClick={addPresetProvider}>
                  Add preset
                </button>
                <button type="button" className="btn btn-secondary" onClick={addCustomProvider}>
                  Add custom
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <input
                className="input-field md:col-span-2"
                placeholder="Section title"
                value={home?.aiSection?.title || ""}
                onChange={(e) => setHome((prev) => ({ ...prev, aiSection: { ...(prev?.aiSection || {}), title: e.target.value } }))}
              />
              <textarea
                className="input-field md:col-span-2 min-h-[84px]"
                placeholder="Subtitle"
                value={home?.aiSection?.subtitle || ""}
                onChange={(e) => setHome((prev) => ({ ...prev, aiSection: { ...(prev?.aiSection || {}), subtitle: e.target.value } }))}
              />
              <input
                className="input-field md:col-span-2"
                placeholder="Footnote"
                value={home?.aiSection?.footnote || ""}
                onChange={(e) => setHome((prev) => ({ ...prev, aiSection: { ...(prev?.aiSection || {}), footnote: e.target.value } }))}
              />

              {aiProviders.map((p, idx) => (
                <div key={`${p.id}-${idx}`} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-300">Provider {idx + 1}</div>
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-secondary" disabled={idx === 0} onClick={() => moveAiProvider(idx, -1)}>
                        Up
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={idx === aiProviders.length - 1}
                        onClick={() => moveAiProvider(idx, 1)}
                      >
                        Down
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => removeAiProvider(idx)}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2">
                    <input
                      className="input-field"
                      placeholder="id (slug)"
                      value={p.id}
                      onChange={(e) => updateAiProvider(idx, { id: e.target.value })}
                    />
                    <input
                      className="input-field"
                      placeholder="Label"
                      value={p.label}
                      onChange={(e) => updateAiProvider(idx, { label: e.target.value })}
                    />
                    <input
                      className="input-field"
                      placeholder="Icon (SimpleIcons slug or full URL)"
                      value={p.icon || ""}
                      onChange={(e) => updateAiProvider(idx, { icon: e.target.value || undefined })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save homepage"}
            </button>
            {mutation.isSuccess ? <span className="text-sm text-emerald-200">Saved.</span> : null}
            {mutation.isError ? <span className="text-sm text-red-200">Save failed.</span> : null}
          </div>
        </form>
      )}
    </SectionCard>
  );
}

export default HomepageEditor;
