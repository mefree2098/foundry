import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import SectionCard from "../components/SectionCard";
import { fetchConfig, saveConfig } from "../lib/api";
import type { SiteConfig } from "../lib/types";

type FieldDef = NonNullable<NonNullable<NonNullable<SiteConfig["content"]>["schemas"]>["platforms"]>[number];
type SchemaKey = "platforms" | "news" | "topics";

const fieldTypes = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "url", label: "URL" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
] as const;

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

const emptySchemas: NonNullable<SiteConfig["content"]> = {
  schemas: {
    platforms: [],
    news: [],
    topics: [],
  },
};

function ContentSchemaEditor() {
  const { data: config, isLoading, isError } = useQuery({ queryKey: ["config"], queryFn: fetchConfig });
  const mutation = useMutation({ mutationFn: saveConfig });

  const [activeKey, setActiveKey] = useState<SchemaKey>("platforms");
  const [content, setContent] = useState<SiteConfig["content"]>(emptySchemas);

  useEffect(() => {
    if (!config) return;
    const incoming = config.content?.schemas || {};
    setContent({
      schemas: {
        platforms: incoming.platforms || [],
        news: incoming.news || [],
        topics: incoming.topics || [],
      },
    });
  }, [config]);

  const schemas = content?.schemas || {};
  const activeList = (schemas[activeKey] || []) as FieldDef[];

  const schemaLabel = useMemo(() => {
    if (activeKey === "platforms") return "Platforms";
    if (activeKey === "news") return "News";
    return "Topics";
  }, [activeKey]);

  const setActiveList = (next: FieldDef[]) => {
    setContent((prev) => ({
      schemas: {
        ...(prev?.schemas || {}),
        [activeKey]: next,
      } as any,
    }));
  };

  const addField = () => {
    const ids = new Set(activeList.map((f) => f.id));
    const id = ensureUniqueId(ids, "new-field");
    setActiveList([...activeList, { id, label: "New field", type: "text" }]);
  };

  const updateField = (idx: number, patch: Partial<FieldDef>) => {
    const next = [...activeList];
    next[idx] = { ...next[idx], ...patch };
    setActiveList(next);
  };

  const removeField = (idx: number) => {
    const next = [...activeList];
    next.splice(idx, 1);
    setActiveList(next);
  };

  const moveField = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= activeList.length) return;
    setActiveList(moveItem(activeList, idx, nextIdx));
  };

  const normalizeIds = () => {
    const ids = new Set<string>();
    const next = activeList.map((f) => {
      const base = slugify(f.id || f.label || "field") || "field";
      const id = ensureUniqueId(ids, base);
      ids.add(id);
      return { ...f, id };
    });
    setActiveList(next);
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({ id: "global", content });
  };

  return (
    <SectionCard title="Content fields">
      {isLoading ? (
        <div className="text-sm text-slate-200">Loading.</div>
      ) : isError ? (
        <div className="text-sm text-red-200">Failed to load config.</div>
      ) : (
        <form className="space-y-4" onSubmit={save}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">{schemaLabel}</div>
              <div className="text-xs text-slate-300">
                Define extra fields stored under <code className="text-slate-200">custom.&lt;fieldId&gt;</code>.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select className="input-field" value={activeKey} onChange={(e) => setActiveKey(e.target.value as SchemaKey)}>
                <option value="platforms">Platforms</option>
                <option value="news">News</option>
                <option value="topics">Topics</option>
              </select>
              <button type="button" className="btn btn-secondary" onClick={normalizeIds}>
                Normalize IDs
              </button>
              <button type="button" className="btn btn-secondary" onClick={addField}>
                Add field
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {activeList.map((f, idx) => (
              <div key={f.id || idx} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="grid gap-2 md:grid-cols-[1fr_180px_100px_auto] items-center">
                  <input
                    className="input-field"
                    placeholder="Label"
                    value={f.label || ""}
                    onChange={(e) => updateField(idx, { label: e.target.value })}
                  />
                  <select
                    className="input-field"
                    value={String(f.type || "text")}
                    onChange={(e) => updateField(idx, { type: e.target.value })}
                  >
                    {fieldTypes.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={Boolean(f.required)}
                      onChange={(e) => updateField(idx, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  <div className="flex gap-2 justify-end">
                    <button type="button" className="btn btn-secondary" disabled={idx === 0} onClick={() => moveField(idx, -1)}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={idx === activeList.length - 1}
                      onClick={() => moveField(idx, 1)}
                    >
                      ↓
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => removeField(idx)}>
                      Remove
                    </button>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <input
                    className="input-field"
                    placeholder="Field id (custom.<id>)"
                    value={f.id || ""}
                    onChange={(e) => updateField(idx, { id: e.target.value })}
                  />
                  <input
                    className="input-field"
                    placeholder="Placeholder (optional)"
                    value={f.placeholder || ""}
                    onChange={(e) => updateField(idx, { placeholder: e.target.value })}
                  />
                  <input
                    className="input-field md:col-span-2"
                    placeholder="Help text (optional)"
                    value={f.help || ""}
                    onChange={(e) => updateField(idx, { help: e.target.value })}
                  />
                </div>
              </div>
            ))}
            {activeList.length === 0 ? <div className="text-xs text-slate-400">No extra fields configured.</div> : null}
          </div>

          <div className="flex gap-3">
            <button type="submit" className="btn btn-primary">
              Save fields
            </button>
            {mutation.isSuccess ? <span className="text-emerald-200">Saved.</span> : null}
            {mutation.isError ? <span className="text-red-200">Save failed.</span> : null}
          </div>
        </form>
      )}
    </SectionCard>
  );
}

export default ContentSchemaEditor;

