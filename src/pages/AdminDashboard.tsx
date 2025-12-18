import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../hooks/useAuth";
import {
  deleteNews,
  deletePlatform,
  deleteTopic,
  fetchConfig,
  fetchAiUsage,
  fetchNews,
  fetchPlatforms,
  fetchTopics,
  generateImage,
  refreshAiPricing,
  requestUploadSas,
  saveConfig,
  saveNews,
  savePlatform,
  saveTopic,
} from "../lib/api";
import ConfigEditor from "./ConfigEditor";
import HomepageEditor from "./HomepageEditor";
import AdminEmailSection from "../components/AdminEmailSection";
import ContentSchemaEditor from "./ContentSchemaEditor";
import type { SiteConfig } from "../lib/types";
import AdminAiAssistant from "./AdminAiAssistant";
import { MediaPicker } from "../components/MediaPicker";

type LinkItem = { label: string; url: string };

type PlatformForm = {
  id: string;
  name: string;
  tagline: string;
  summary: string;
  description: string;
  heroImageUrl: string;
  topics: string[];
  linksList: LinkItem[];
  custom: Record<string, unknown>;
};

type TopicForm = {
  id: string;
  name: string;
  description: string;
  custom: Record<string, unknown>;
};

type NewsForm = {
  id: string;
  title: string;
  type: "Announcement" | "Update" | "Insight";
  status: "Published" | "Draft";
  publishDate: string;
  summary: string;
  content: string;
  imageUrl: string;
  imageAlt: string;
  platformIds: string[];
  topics: string[];
  linksList: LinkItem[];
  custom: Record<string, unknown>;
};

const defaultPlatform: PlatformForm = {
  id: "",
  name: "",
  tagline: "",
  summary: "",
  description: "",
  heroImageUrl: "",
  topics: [],
  linksList: [{ label: "", url: "" }],
  custom: {},
};

const defaultTopic: TopicForm = { id: "", name: "", description: "", custom: {} };

const defaultNews: NewsForm = {
  id: "",
  title: "",
  type: "Update",
  status: "Published",
  publishDate: "",
  summary: "",
  content: "",
  imageUrl: "",
  imageAlt: "",
  platformIds: [],
  topics: [],
  linksList: [{ label: "", url: "" }],
  custom: {},
};

function toLinkRecord(list: LinkItem[]) {
  const entries = (list || [])
    .map((item) => ({ label: item.label.trim(), url: item.url.trim() }))
    .filter((item) => item.label && item.url);
  return entries.length ? Object.fromEntries(entries.map((item) => [item.label, item.url])) : undefined;
}

function cleanCustom(custom: Record<string, unknown> | undefined) {
  const entries = Object.entries(custom || {}).filter(([, v]) => {
    if (v === undefined || v === null) return false;
    if (typeof v === "string" && !v.trim()) return false;
    return true;
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

async function uploadImage(file: File) {
  const contentType = file.type || "application/octet-stream";
  const sas = await requestUploadSas(file.name, contentType);
  await fetch(sas.uploadUrl, {
    method: "PUT",
    headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": contentType },
    body: file,
  });
  return sas.blobUrl;
}

type FieldDef = NonNullable<NonNullable<NonNullable<SiteConfig["content"]>["schemas"]>["platforms"]>[number];

function normalizeCustomValue(field: FieldDef, raw: unknown) {
  const t = String(field.type || "text").toLowerCase();
  if (t === "number") {
    const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
    return Number.isFinite(n) ? n : undefined;
  }
  if (t === "boolean") return Boolean(raw);
  const s = String(raw ?? "");
  return s.trim() ? s : undefined;
}

function CustomFieldsEditor({
  fields,
  value,
  onChange,
}: {
  fields: FieldDef[];
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  if (!fields.length) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-slate-300 mb-2">Custom fields</div>
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map((f) => {
          const key = f.id;
          const type = String(f.type || "text").toLowerCase();
          const current = value?.[key];
          const placeholder = f.placeholder || f.label;

          return (
            <label key={key} className={type === "textarea" ? "md:col-span-2 grid gap-1" : "grid gap-1"}>
              <span className="text-xs text-slate-300">{f.label}</span>
              {type === "boolean" ? (
                <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={Boolean(current)}
                    onChange={(e) => onChange({ ...(value || {}), [key]: normalizeCustomValue(f, e.target.checked) })}
                  />
                  <span className="text-xs text-slate-200">{f.help || "Enabled"}</span>
                </div>
              ) : type === "textarea" ? (
                <textarea
                  className="input-field min-h-[100px]"
                  placeholder={placeholder}
                  value={typeof current === "string" ? current : current == null ? "" : String(current)}
                  onChange={(e) => onChange({ ...(value || {}), [key]: normalizeCustomValue(f, e.target.value) })}
                />
              ) : (
                <input
                  className="input-field"
                  type={type === "url" ? "url" : type === "number" ? "number" : "text"}
                  placeholder={placeholder}
                  value={typeof current === "string" ? current : current == null ? "" : String(current)}
                  onChange={(e) => onChange({ ...(value || {}), [key]: normalizeCustomValue(f, e.target.value) })}
                />
              )}
              {f.help && type !== "boolean" ? <span className="text-xs text-slate-400">{f.help}</span> : null}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function AdminDashboard() {
  const queryClient = useQueryClient();
  const { loading: authLoading, isAdmin } = useAuth();

  const { data: platforms = [] } = useQuery({ queryKey: ["platforms"], queryFn: fetchPlatforms });
  const { data: topics = [] } = useQuery({ queryKey: ["topics"], queryFn: fetchTopics });
  const { data: news = [] } = useQuery({ queryKey: ["news", { all: true }], queryFn: () => fetchNews() });
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: fetchConfig });

  const sortedPlatforms = useMemo(() => [...platforms].sort((a, b) => (a.name || "").localeCompare(b.name || "")), [platforms]);
  const sortedTopics = useMemo(() => [...topics].sort((a, b) => (a.name || "").localeCompare(b.name || "")), [topics]);
  const sortedNews = useMemo(() => {
    const list = [...news];
    const toDate = (d?: string) => Date.parse(d || "");
    return list.sort((a, b) => {
      const ad = toDate(a.publishDate);
      const bd = toDate(b.publishDate);
      return (isNaN(bd) ? 0 : bd) - (isNaN(ad) ? 0 : ad);
    });
  }, [news]);

  const [platformForm, setPlatformForm] = useState<PlatformForm>(defaultPlatform);
  const [topicForm, setTopicForm] = useState<TopicForm>(defaultTopic);
  const [newsForm, setNewsForm] = useState<NewsForm>(defaultNews);
  const [uploading, setUploading] = useState<null | "platformHero" | "newsImage">(null);
  const [generating, setGenerating] = useState<null | "platformHero" | "newsImage">(null);
  const [mediaPicker, setMediaPicker] = useState<null | "platformHero" | "newsImage">(null);
  const [pricingRows, setPricingRows] = useState<{ model: string; inputUsd: string; outputUsd: string }[]>([]);
  const [pricingDirty, setPricingDirty] = useState(false);
  const [pricingImportText, setPricingImportText] = useState("");

  const {
    data: aiUsage,
    isLoading: aiUsageLoading,
    isError: aiUsageError,
    isFetching: aiUsageFetching,
    refetch: refetchAiUsage,
  } = useQuery({
    queryKey: ["ai-usage"],
    queryFn: fetchAiUsage,
  });

  useEffect(() => {
    if (!config || pricingDirty) return;
    const models = config.ai?.pricing?.models || {};
    const rows = Object.entries(models)
      .map(([model, price]) => ({
        model,
        inputUsd: String(price.inputUsdPerMillion ?? ""),
        outputUsd: String(price.outputUsdPerMillion ?? ""),
      }))
      .sort((a, b) => a.model.localeCompare(b.model));
    setPricingRows(rows);
  }, [config, pricingDirty]);

  const platformSave = useMutation({
    mutationFn: savePlatform,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platforms"] });
      setPlatformForm(defaultPlatform);
    },
    onError: (err: unknown) => alert(err instanceof Error ? err.message : "Failed to save platform"),
  });

  const topicSave = useMutation({
    mutationFn: saveTopic,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["topics"] });
      setTopicForm(defaultTopic);
    },
    onError: (err: unknown) => alert(err instanceof Error ? err.message : "Failed to save topic"),
  });

  const newsSave = useMutation({
    mutationFn: saveNews,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["news"] });
      await queryClient.invalidateQueries({ queryKey: ["news", { all: true }] });
      setNewsForm(defaultNews);
    },
    onError: (err: unknown) => alert(err instanceof Error ? err.message : "Failed to save news"),
  });

  const refreshPricing = useMutation({
    mutationFn: (payload?: { pricingText?: string }) => refreshAiPricing(payload),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["config"] });
      await queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
      setPricingDirty(false);
      if (variables?.pricingText) setPricingImportText("");
    },
    onError: (err: unknown) => alert(err instanceof Error ? err.message : "Failed to refresh pricing"),
  });

  const savePricing = useMutation({
    mutationFn: async () => {
      const base = config || ({ id: "global" } as SiteConfig);
      const models: Record<string, { inputUsdPerMillion: number; outputUsdPerMillion: number }> = {};
      for (const row of pricingRows) {
        const model = row.model.trim();
        if (!model) continue;
        const input = Number(row.inputUsd);
        const output = Number(row.outputUsd);
        if (!Number.isFinite(input) || !Number.isFinite(output)) continue;
        models[model] = { inputUsdPerMillion: input, outputUsdPerMillion: output };
      }
      const next: SiteConfig = {
        ...base,
        ai: {
          ...(base.ai || {}),
          pricing: {
            source: "manual",
            updatedAt: new Date().toISOString(),
            models,
          },
        },
      } as SiteConfig;
      await saveConfig(next);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["config"] });
      await queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
      setPricingDirty(false);
    },
    onError: (err: unknown) => alert(err instanceof Error ? err.message : "Failed to save pricing"),
  });

  const platformDelete = useMutation({
    mutationFn: deletePlatform,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platforms"] });
      setPlatformForm(defaultPlatform);
    },
    onError: (err: unknown) => alert(err instanceof Error ? err.message : "Failed to delete platform"),
  });

  const topicDelete = useMutation({
    mutationFn: deleteTopic,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["topics"] });
      setTopicForm(defaultTopic);
    },
    onError: (err: unknown) => alert(err instanceof Error ? err.message : "Failed to delete topic"),
  });

  const newsDelete = useMutation({
    mutationFn: deleteNews,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["news"] });
      await queryClient.invalidateQueries({ queryKey: ["news", { all: true }] });
      setNewsForm(defaultNews);
    },
    onError: (err: unknown) => alert(err instanceof Error ? err.message : "Failed to delete news"),
  });

  const loginButtons = (
    <div className="mt-3 flex flex-wrap gap-3">
      <a
        href="/.auth/login/github"
        className="btn btn-secondary"
      >
        Sign in with GitHub
      </a>
      <a
        href="/.auth/login/aad"
        className="btn btn-secondary"
      >
        Sign in with Microsoft Entra
      </a>
      <a
        href="/.auth/logout"
        className="rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-emerald-50 transition hover:border-white/40"
      >
        Logout
      </a>
    </div>
  );

  const loadPlatform = (id: string) => {
    const p = platforms.find((x) => x.id === id);
    if (!p) return;
    setPlatformForm({
      id: p.id || "",
      name: p.name || "",
      tagline: p.tagline || "",
      summary: p.summary || "",
      description: p.description || "",
      heroImageUrl: p.heroImageUrl || "",
      topics: p.topics || [],
      linksList: p.links ? Object.entries(p.links).map(([label, url]) => ({ label, url })) : [{ label: "", url: "" }],
      custom: (p.custom as Record<string, unknown> | undefined) || {},
    });
  };

  const loadTopic = (id: string) => {
    const t = topics.find((x) => x.id === id);
    if (!t) return;
    setTopicForm({
      id: t.id || "",
      name: t.name || "",
      description: t.description || "",
      custom: (t.custom as Record<string, unknown> | undefined) || {},
    });
  };

  const loadNews = (id: string) => {
    const n = news.find((x) => x.id === id);
    if (!n) return;
    setNewsForm({
      id: n.id || "",
      title: n.title || "",
      type: n.type || "Update",
      status: n.status || "Published",
      publishDate: n.publishDate || "",
      summary: n.summary || "",
      content: n.content || "",
      imageUrl: n.imageUrl || "",
      imageAlt: n.imageAlt || "",
      platformIds: n.platformIds || [],
      topics: n.topics || [],
      linksList: n.links ? Object.entries(n.links).map(([label, url]) => ({ label, url })) : [{ label: "", url: "" }],
      custom: (n.custom as Record<string, unknown> | undefined) || {},
    });
  };

  const setLinksList = (target: "platform" | "news", list: LinkItem[]) => {
    const next = list.length ? list : [{ label: "", url: "" }];
    if (target === "platform") setPlatformForm((prev) => ({ ...prev, linksList: next }));
    else setNewsForm((prev) => ({ ...prev, linksList: next }));
  };

  const addLinkRow = (target: "platform" | "news") => {
    if (target === "platform") {
      setPlatformForm((prev) => ({ ...prev, linksList: [...prev.linksList, { label: "", url: "" }] }));
    } else {
      setNewsForm((prev) => ({ ...prev, linksList: [...prev.linksList, { label: "", url: "" }] }));
    }
  };

  const updateLinkRow = (target: "platform" | "news", index: number, field: keyof LinkItem, value: string) => {
    const update = (items: LinkItem[]) => {
      const next = [...items];
      next[index] = { ...next[index], [field]: value };
      return next;
    };
    if (target === "platform") setPlatformForm((prev) => ({ ...prev, linksList: update(prev.linksList) }));
    else setNewsForm((prev) => ({ ...prev, linksList: update(prev.linksList) }));
  };

  const removeLinkRow = (target: "platform" | "news", index: number) => {
    const current = target === "platform" ? platformForm.linksList : newsForm.linksList;
    const next = [...current];
    next.splice(index, 1);
    setLinksList(target, next);
  };

  const handlePlatformSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!platformForm.id.trim() || !platformForm.name.trim()) return;
    platformSave.mutate({
      id: platformForm.id.trim(),
      name: platformForm.name.trim(),
      tagline: platformForm.tagline.trim() || undefined,
      summary: platformForm.summary.trim() || undefined,
      description: platformForm.description.trim() || undefined,
      heroImageUrl: platformForm.heroImageUrl.trim() || undefined,
      topics: platformForm.topics.length ? platformForm.topics : undefined,
      links: toLinkRecord(platformForm.linksList),
      custom: cleanCustom(platformForm.custom),
    });
  };

  const handleTopicSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!topicForm.id.trim() || !topicForm.name.trim()) return;
    topicSave.mutate({
      id: topicForm.id.trim(),
      name: topicForm.name.trim(),
      description: topicForm.description.trim() || undefined,
      custom: cleanCustom(topicForm.custom),
    });
  };

  const handleNewsSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newsForm.id.trim() || !newsForm.title.trim()) return;
    newsSave.mutate({
      id: newsForm.id.trim(),
      title: newsForm.title.trim(),
      type: newsForm.type,
      status: newsForm.status,
      publishDate: newsForm.publishDate.trim() || undefined,
      summary: newsForm.summary.trim() || undefined,
      content: newsForm.content.trim() || undefined,
      imageUrl: newsForm.imageUrl.trim() || undefined,
      imageAlt: newsForm.imageAlt.trim() || undefined,
      platformIds: newsForm.platformIds.length ? newsForm.platformIds : undefined,
      topics: newsForm.topics.length ? newsForm.topics : undefined,
      links: toLinkRecord(newsForm.linksList),
      custom: cleanCustom(newsForm.custom),
    });
  };

  if (!authLoading && !isAdmin) {
    return (
      <SectionCard title="Admin portal">
        <div className="text-sm text-red-200 space-y-2">
          <div>Admin privileges required.</div>
          {loginButtons}
        </div>
      </SectionCard>
    );
  }

  const platformEmbedHtml = typeof platformForm.custom?.embedHtml === "string" ? platformForm.custom.embedHtml : "";
  const platformEmbedHeightRaw = platformForm.custom?.embedHeight;
  const platformEmbedHeight =
    typeof platformEmbedHeightRaw === "number" ? platformEmbedHeightRaw : Number(platformEmbedHeightRaw) || 360;

  const newsEmbedHtml = typeof newsForm.custom?.embedHtml === "string" ? newsForm.custom.embedHtml : "";
  const newsEmbedHeightRaw = newsForm.custom?.embedHeight;
  const newsEmbedHeight = typeof newsEmbedHeightRaw === "number" ? newsEmbedHeightRaw : Number(newsEmbedHeightRaw) || 360;

  const topicEmbedHtml = typeof topicForm.custom?.embedHtml === "string" ? topicForm.custom.embedHtml : "";
  const topicEmbedHeightRaw = topicForm.custom?.embedHeight;
  const topicEmbedHeight = typeof topicEmbedHeightRaw === "number" ? topicEmbedHeightRaw : Number(topicEmbedHeightRaw) || 360;

  const mediaPickerTitle = mediaPicker === "platformHero" ? "Select platform hero image" : "Select news image";

  const handleSelectMedia = (url: string) => {
    if (mediaPicker === "platformHero") {
      setPlatformForm((prev) => ({ ...prev, heroImageUrl: url }));
    }
    if (mediaPicker === "newsImage") {
      setNewsForm((prev) => ({ ...prev, imageUrl: url }));
    }
    setMediaPicker(null);
  };

  const handleGeneratePlatformImage = async () => {
    if (!config?.ai?.adminAssistant?.openai?.hasApiKey) {
      alert("OpenAI API key not saved yet. Set it under Admin > AI assistant.");
      return;
    }
    const prompt = window.prompt(
      "Describe the platform hero image to generate:",
      platformForm.name ? `${platformForm.name} platform, modern, professional, abstract technology` : "",
    );
    if (!prompt) return;
    if (!confirm("Generate image with OpenAI and save to your media library?")) return;
    try {
      setGenerating("platformHero");
      const result = await generateImage({ prompt, filenameHint: platformForm.id || platformForm.name || "platform" });
      setPlatformForm((prev) => ({ ...prev, heroImageUrl: result.blobUrl }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Image generation failed");
    } finally {
      setGenerating(null);
    }
  };

  const handleGenerateNewsImage = async () => {
    if (!config?.ai?.adminAssistant?.openai?.hasApiKey) {
      alert("OpenAI API key not saved yet. Set it under Admin > AI assistant.");
      return;
    }
    const prompt = window.prompt(
      "Describe the news image to generate:",
      newsForm.title ? `${newsForm.title} news header, modern, professional` : "",
    );
    if (!prompt) return;
    if (!confirm("Generate image with OpenAI and save to your media library?")) return;
    try {
      setGenerating("newsImage");
      const result = await generateImage({ prompt, filenameHint: newsForm.id || newsForm.title || "news" });
      setNewsForm((prev) => ({ ...prev, imageUrl: result.blobUrl }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Image generation failed");
    } finally {
      setGenerating(null);
    }
  };


  return (
    <div className="space-y-6">
      <SectionCard title="Admin portal">
        <p className="text-sm text-emerald-50">Manage platforms, news, topics, and site configuration.</p>
        {authLoading ? <div className="text-sm text-emerald-100">Checking access...</div> : <div className="text-sm text-emerald-100">Access granted.</div>}
        {loginButtons}
      </SectionCard>

      <AdminAiAssistant />

      <SectionCard title="AI usage & pricing">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-300">
              {aiUsage?.updatedAt ? `Last updated ${new Date(aiUsage.updatedAt).toLocaleString()}` : "Usage totals update after AI calls."}
            </div>
            <button type="button" className="btn btn-secondary" disabled={aiUsageFetching} onClick={() => refetchAiUsage()}>
              {aiUsageFetching ? "Refreshing..." : "Refresh usage"}
            </button>
          </div>

          {aiUsageLoading ? (
            <div className="text-sm text-slate-200">Loading AI usage...</div>
          ) : aiUsageError ? (
            <div className="text-sm text-red-200">Failed to load usage stats.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-slate-300">Last 30 days · Chat</div>
                <div className="mt-2 text-sm text-slate-100">
                  Tokens: {aiUsage?.last30Days?.models?.totals?.totalTokens?.toLocaleString?.() || "0"}
                </div>
                <div className="text-xs text-slate-400">
                  Cost: {aiUsage?.last30Days?.models?.totals?.costUsd != null ? `$${aiUsage.last30Days.models.totals.costUsd}` : "Pricing missing"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-slate-300">Last 30 days · Images</div>
                <div className="mt-2 text-sm text-slate-100">
                  Tokens: {aiUsage?.last30Days?.images?.totals?.totalTokens?.toLocaleString?.() || "0"}
                </div>
                <div className="text-xs text-slate-400">
                  Cost: {aiUsage?.last30Days?.images?.totals?.costUsd != null ? `$${aiUsage.last30Days.images.totals.costUsd}` : "Pricing missing"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-slate-300">All time · Chat</div>
                <div className="mt-2 text-sm text-slate-100">
                  Tokens: {aiUsage?.allTime?.models?.totals?.totalTokens?.toLocaleString?.() || "0"}
                </div>
                <div className="text-xs text-slate-400">
                  Cost: {aiUsage?.allTime?.models?.totals?.costUsd != null ? `$${aiUsage.allTime.models.totals.costUsd}` : "Pricing missing"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-slate-300">All time · Images</div>
                <div className="mt-2 text-sm text-slate-100">
                  Tokens: {aiUsage?.allTime?.images?.totals?.totalTokens?.toLocaleString?.() || "0"}
                </div>
                <div className="text-xs text-slate-400">
                  Cost: {aiUsage?.allTime?.images?.totals?.costUsd != null ? `$${aiUsage.allTime.images.totals.costUsd}` : "Pricing missing"}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs text-slate-300">Pricing overrides (USD per 1M tokens)</div>
                <div className="text-xs text-slate-400">
                  Source: {aiUsage?.pricing?.source || "manual"} {aiUsage?.pricing?.updatedAt ? `· ${aiUsage.pricing.updatedAt}` : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary" disabled={refreshPricing.isPending} onClick={() => refreshPricing.mutate(undefined)}>
                  {refreshPricing.isPending ? "Refreshing..." : "Refresh from OpenAI"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setPricingRows((prev) => [...prev, { model: "", inputUsd: "", outputUsd: "" }]);
                    setPricingDirty(true);
                  }}
                >
                  Add model
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={savePricing.isPending}
                  onClick={() => savePricing.mutate()}
                >
                  {savePricing.isPending ? "Saving..." : "Save pricing"}
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-2">
              {pricingRows.length ? (
                pricingRows.map((row, idx) => (
                  <div key={`${row.model}-${idx}`} className="grid gap-2 md:grid-cols-[1.4fr_1fr_1fr_auto]">
                    <input
                      className="input-field"
                      placeholder="Model (e.g., gpt-4o-mini)"
                      value={row.model}
                      onChange={(e) => {
                        const next = [...pricingRows];
                        next[idx] = { ...next[idx], model: e.target.value };
                        setPricingRows(next);
                        setPricingDirty(true);
                      }}
                    />
                    <input
                      className="input-field"
                      placeholder="Input USD per 1M"
                      value={row.inputUsd}
                      onChange={(e) => {
                        const next = [...pricingRows];
                        next[idx] = { ...next[idx], inputUsd: e.target.value };
                        setPricingRows(next);
                        setPricingDirty(true);
                      }}
                    />
                    <input
                      className="input-field"
                      placeholder="Output USD per 1M"
                      value={row.outputUsd}
                      onChange={(e) => {
                        const next = [...pricingRows];
                        next[idx] = { ...next[idx], outputUsd: e.target.value };
                        setPricingRows(next);
                        setPricingDirty(true);
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        const next = pricingRows.filter((_, i) => i !== idx);
                        setPricingRows(next);
                        setPricingDirty(true);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400">No pricing overrides set. Add rows to enable cost estimates.</div>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs text-slate-300">Import pricing from text</div>
              <div className="text-xs text-slate-400">
                Paste the OpenAI pricing page text here if automatic refresh is blocked.
              </div>
              <textarea
                className="input-field mt-2 min-h-[120px]"
                placeholder="Paste pricing text from openai.com/api/pricing"
                value={pricingImportText}
                onChange={(e) => setPricingImportText(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!pricingImportText.trim() || refreshPricing.isPending}
                  onClick={() => refreshPricing.mutate({ pricingText: pricingImportText })}
                >
                  {refreshPricing.isPending ? "Importing..." : "Import from text"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPricingImportText("")}
                  disabled={!pricingImportText.trim()}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Platforms">
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <select
            className="input-field"
            value=""
            onChange={(e) => loadPlatform(e.target.value)}
          >
            <option value="">Load existing platform…</option>
            {sortedPlatforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </select>
          <div className="text-xs text-slate-400 self-center">
            {sortedPlatforms.length} total · Deleting is blocked if referenced by news.
          </div>
        </div>

        <form className="space-y-4" onSubmit={handlePlatformSubmit}>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="input-field"
              placeholder="Slug (id)"
              value={platformForm.id}
              onChange={(e) => setPlatformForm({ ...platformForm, id: e.target.value })}
            />
            <input
              className="input-field"
              placeholder="Name"
              value={platformForm.name}
              onChange={(e) => setPlatformForm({ ...platformForm, name: e.target.value })}
            />
            <input
              className="input-field"
              placeholder="Tagline"
              value={platformForm.tagline}
              onChange={(e) => setPlatformForm({ ...platformForm, tagline: e.target.value })}
            />
            <input
              className="input-field"
              placeholder="Hero image URL"
              value={platformForm.heroImageUrl}
              onChange={(e) => setPlatformForm({ ...platformForm, heroImageUrl: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-slate-300">Upload hero image</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={uploading === "platformHero"}
                className="btn btn-primary"
                onClick={() => document.getElementById("platform-hero-upload")?.click()}
              >
                {uploading === "platformHero" ? "Uploading..." : "Choose file"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setMediaPicker("platformHero")}
              >
                Browse library
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={generating === "platformHero"}
                onClick={handleGeneratePlatformImage}
              >
                {generating === "platformHero" ? "Generating..." : "Generate with AI"}
              </button>
              <span className="text-xs text-slate-300">{platformForm.heroImageUrl ? "Image selected" : "No file chosen"}</span>
              {platformForm.heroImageUrl && (
                <img src={platformForm.heroImageUrl} alt="Hero preview" className="h-12 w-12 rounded object-cover ring-1 ring-white/20" />
              )}
              <input
                id="platform-hero-upload"
                type="file"
                accept="image/*"
                disabled={uploading === "platformHero"}
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    setUploading("platformHero");
                    const url = await uploadImage(file);
                    setPlatformForm((prev) => ({ ...prev, heroImageUrl: url }));
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Upload failed");
                  } finally {
                    setUploading(null);
                    e.target.value = "";
                  }
                }}
              />
            </div>
          </div>

          <textarea
            className="input-field min-h-[70px]"
            placeholder="Summary (short)"
            value={platformForm.summary}
            onChange={(e) => setPlatformForm({ ...platformForm, summary: e.target.value })}
          />
          <textarea
            className="input-field min-h-[120px]"
            placeholder="Description"
            value={platformForm.description}
            onChange={(e) => setPlatformForm({ ...platformForm, description: e.target.value })}
          />

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-slate-300 mb-2">3D embed (optional)</div>
            <textarea
              className="input-field min-h-[120px] font-mono text-xs"
              placeholder="Paste full HTML for a 3D embed (three.js, Babylon, or custom WebGL)."
              value={platformEmbedHtml}
              onChange={(e) =>
                setPlatformForm((prev) => ({
                  ...prev,
                  custom: { ...(prev.custom || {}), embedHtml: e.target.value },
                }))
              }
            />
            <input
              className="input-field mt-2"
              type="number"
              min={200}
              max={2000}
              placeholder="Embed height (px)"
              value={platformEmbedHeight}
              onChange={(e) =>
                setPlatformForm((prev) => ({
                  ...prev,
                  custom: { ...(prev.custom || {}), embedHeight: Number(e.target.value) || undefined },
                }))
              }
            />
          </div>

          <div>
            <div className="text-xs text-slate-300 mb-2">Topics</div>
            <div className="flex flex-wrap gap-2">
              {sortedTopics.map((t) => (
                <label key={t.id} className="flex items-center gap-2 rounded border border-white/10 px-2 py-1 text-xs text-slate-100">
                  <input
                    type="checkbox"
                    checked={platformForm.topics.includes(t.id)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...platformForm.topics, t.id]
                        : platformForm.topics.filter((id) => id !== t.id);
                      setPlatformForm((prev) => ({ ...prev, topics: next }));
                    }}
                  />
                  {t.name}
                </label>
              ))}
              {topics.length === 0 && <span className="text-xs text-slate-400">No topics yet.</span>}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-300 mb-2">Links</div>
            <div className="space-y-2">
              {platformForm.linksList.map((item, idx) => (
                <div key={idx} className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
                  <input
                    className="input-field"
                    placeholder="Label (e.g., Docs)"
                    value={item.label}
                    onChange={(e) => updateLinkRow("platform", idx, "label", e.target.value)}
                  />
                  <input
                    className="input-field"
                    placeholder="URL (https://...)"
                    value={item.url}
                    onChange={(e) => updateLinkRow("platform", idx, "url", e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => removeLinkRow("platform", idx)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-secondary mt-2"
              onClick={() => addLinkRow("platform")}
            >
              Add link
            </button>
          </div>

          <CustomFieldsEditor
            fields={((config?.content?.schemas?.platforms || []) as FieldDef[]).filter((f) => f.id && f.label)}
            value={platformForm.custom}
            onChange={(next) => setPlatformForm((prev) => ({ ...prev, custom: next }))}
          />

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={platformSave.isPending}
              className="btn btn-primary"
            >
              {platformSave.isPending ? "Saving..." : "Save platform"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPlatformForm(defaultPlatform)}
            >
              Reset
            </button>
            <button
              type="button"
              disabled={!platformForm.id || platformDelete.isPending}
              className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-red-300/70 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                if (!platformForm.id) return;
                if (!confirm(`Delete platform "${platformForm.id}"?`)) return;
                platformDelete.mutate(platformForm.id);
              }}
            >
              {platformDelete.isPending ? "Deleting..." : "Delete"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Topics">
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <select
            className="input-field"
            value=""
            onChange={(e) => loadTopic(e.target.value)}
          >
            <option value="">Load existing topic…</option>
            {sortedTopics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.id})
              </option>
            ))}
          </select>
          <div className="text-xs text-slate-400 self-center">{sortedTopics.length} total</div>
        </div>

        <form className="space-y-3" onSubmit={handleTopicSubmit}>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="input-field"
              placeholder="Slug (id)"
              value={topicForm.id}
              onChange={(e) => setTopicForm({ ...topicForm, id: e.target.value })}
            />
            <input
              className="input-field"
              placeholder="Name"
              value={topicForm.name}
              onChange={(e) => setTopicForm({ ...topicForm, name: e.target.value })}
            />
          </div>
          <textarea
            className="input-field min-h-[90px]"
            placeholder="Description"
            value={topicForm.description}
            onChange={(e) => setTopicForm({ ...topicForm, description: e.target.value })}
          />

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-slate-300 mb-2">3D embed (optional)</div>
            <textarea
              className="input-field min-h-[120px] font-mono text-xs"
              placeholder="Paste full HTML for a 3D embed (three.js, Babylon, or custom WebGL)."
              value={topicEmbedHtml}
              onChange={(e) =>
                setTopicForm((prev) => ({
                  ...prev,
                  custom: { ...(prev.custom || {}), embedHtml: e.target.value },
                }))
              }
            />
            <input
              className="input-field mt-2"
              type="number"
              min={200}
              max={2000}
              placeholder="Embed height (px)"
              value={topicEmbedHeight}
              onChange={(e) =>
                setTopicForm((prev) => ({
                  ...prev,
                  custom: { ...(prev.custom || {}), embedHeight: Number(e.target.value) || undefined },
                }))
              }
            />
          </div>

          <CustomFieldsEditor
            fields={((config?.content?.schemas?.topics || []) as FieldDef[]).filter((f) => f.id && f.label)}
            value={topicForm.custom}
            onChange={(next) => setTopicForm((prev) => ({ ...prev, custom: next }))}
          />

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={topicSave.isPending}
              className="btn btn-primary"
            >
              {topicSave.isPending ? "Saving..." : "Save topic"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setTopicForm(defaultTopic)}
            >
              Reset
            </button>
            <button
              type="button"
              disabled={!topicForm.id || topicDelete.isPending}
              className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-red-300/70 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                if (!topicForm.id) return;
                if (!confirm(`Delete topic "${topicForm.id}"?`)) return;
                topicDelete.mutate(topicForm.id);
              }}
            >
              {topicDelete.isPending ? "Deleting..." : "Delete"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="News">
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <select
            className="input-field"
            value=""
            onChange={(e) => loadNews(e.target.value)}
          >
            <option value="">Load existing news…</option>
            {sortedNews.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title} ({n.id})
              </option>
            ))}
          </select>
          <div className="text-xs text-slate-400 self-center">{sortedNews.length} total</div>
        </div>

        <form className="space-y-4" onSubmit={handleNewsSubmit}>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="input-field"
              placeholder="Slug (id)"
              value={newsForm.id}
              onChange={(e) => setNewsForm({ ...newsForm, id: e.target.value })}
            />
            <input
              className="input-field"
              placeholder="Title"
              value={newsForm.title}
              onChange={(e) => setNewsForm({ ...newsForm, title: e.target.value })}
            />
            <select
              className="input-field"
              value={newsForm.type}
              onChange={(e) => setNewsForm({ ...newsForm, type: e.target.value as NewsForm["type"] })}
            >
              <option value="Announcement">Announcement</option>
              <option value="Update">Update</option>
              <option value="Insight">Insight</option>
            </select>
            <select
              className="input-field"
              value={newsForm.status}
              onChange={(e) => setNewsForm({ ...newsForm, status: e.target.value as NewsForm["status"] })}
            >
              <option value="Published">Published</option>
              <option value="Draft">Draft</option>
            </select>
            <input
              className="input-field"
              placeholder="Publish date (YYYY-MM-DD or text)"
              value={newsForm.publishDate}
              onChange={(e) => setNewsForm({ ...newsForm, publishDate: e.target.value })}
            />
            <input
              className="input-field"
              placeholder="Image URL"
              value={newsForm.imageUrl}
              onChange={(e) => setNewsForm({ ...newsForm, imageUrl: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-slate-300">Upload news image</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={uploading === "newsImage"}
                className="btn btn-primary"
                onClick={() => document.getElementById("news-image-upload")?.click()}
              >
                {uploading === "newsImage" ? "Uploading..." : "Choose file"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setMediaPicker("newsImage")}
              >
                Browse library
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={generating === "newsImage"}
                onClick={handleGenerateNewsImage}
              >
                {generating === "newsImage" ? "Generating..." : "Generate with AI"}
              </button>
              <span className="text-xs text-slate-300">{newsForm.imageUrl ? "Image selected" : "No file chosen"}</span>
              {newsForm.imageUrl && (
                <img src={newsForm.imageUrl} alt="Preview" className="h-12 w-12 rounded object-cover ring-1 ring-white/20" />
              )}
              <input
                id="news-image-upload"
                type="file"
                accept="image/*"
                disabled={uploading === "newsImage"}
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    setUploading("newsImage");
                    const url = await uploadImage(file);
                    setNewsForm((prev) => ({ ...prev, imageUrl: url }));
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Upload failed");
                  } finally {
                    setUploading(null);
                    e.target.value = "";
                  }
                }}
              />
            </div>
          </div>

          <input
            className="input-field"
            placeholder="Image alt text"
            value={newsForm.imageAlt}
            onChange={(e) => setNewsForm({ ...newsForm, imageAlt: e.target.value })}
          />

          <textarea
            className="input-field min-h-[70px]"
            placeholder="Summary"
            value={newsForm.summary}
            onChange={(e) => setNewsForm({ ...newsForm, summary: e.target.value })}
          />
          <textarea
            className="input-field min-h-[160px]"
            placeholder="Content"
            value={newsForm.content}
            onChange={(e) => setNewsForm({ ...newsForm, content: e.target.value })}
          />

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-slate-300 mb-2">3D embed (optional)</div>
            <textarea
              className="input-field min-h-[120px] font-mono text-xs"
              placeholder="Paste full HTML for a 3D embed (three.js, Babylon, or custom WebGL)."
              value={newsEmbedHtml}
              onChange={(e) =>
                setNewsForm((prev) => ({
                  ...prev,
                  custom: { ...(prev.custom || {}), embedHtml: e.target.value },
                }))
              }
            />
            <input
              className="input-field mt-2"
              type="number"
              min={200}
              max={2000}
              placeholder="Embed height (px)"
              value={newsEmbedHeight}
              onChange={(e) =>
                setNewsForm((prev) => ({
                  ...prev,
                  custom: { ...(prev.custom || {}), embedHeight: Number(e.target.value) || undefined },
                }))
              }
            />
          </div>

          <div>
            <div className="text-xs text-slate-300 mb-2">Related platforms</div>
            <div className="flex flex-wrap gap-2">
              {sortedPlatforms.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    setNewsForm((prev) => ({
                      ...prev,
                      platformIds: prev.platformIds.includes(p.id)
                        ? prev.platformIds.filter((id) => id !== p.id)
                        : [...prev.platformIds, p.id],
                    }))
                  }
                  className={[
                    "rounded-full border px-3 py-1 text-xs transition",
                    newsForm.platformIds.includes(p.id)
                      ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                      : "border-white/10 text-slate-200 hover:border-white/30",
                  ].join(" ")}
                >
                  {p.name || p.id}
                </button>
              ))}
              {platforms.length === 0 && <span className="text-xs text-slate-400">No platforms yet.</span>}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-300 mb-2">Topics</div>
            <div className="flex flex-wrap gap-2">
              {sortedTopics.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setNewsForm((prev) => ({
                      ...prev,
                      topics: prev.topics.includes(t.id) ? prev.topics.filter((id) => id !== t.id) : [...prev.topics, t.id],
                    }))
                  }
                  className={[
                    "rounded-full border px-3 py-1 text-xs transition",
                    newsForm.topics.includes(t.id)
                      ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                      : "border-white/10 text-slate-200 hover:border-white/30",
                  ].join(" ")}
                >
                  {t.name || t.id}
                </button>
              ))}
              {topics.length === 0 && <span className="text-xs text-slate-400">No topics yet.</span>}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-300 mb-2">Links</div>
            <div className="space-y-2">
              {newsForm.linksList.map((item, idx) => (
                <div key={idx} className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
                  <input
                    className="input-field"
                    placeholder="Label (e.g., Press)"
                    value={item.label}
                    onChange={(e) => updateLinkRow("news", idx, "label", e.target.value)}
                  />
                  <input
                    className="input-field"
                    placeholder="URL (https://...)"
                    value={item.url}
                    onChange={(e) => updateLinkRow("news", idx, "url", e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => removeLinkRow("news", idx)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-secondary mt-2"
              onClick={() => addLinkRow("news")}
            >
              Add link
            </button>
          </div>

          <CustomFieldsEditor
            fields={((config?.content?.schemas?.news || []) as FieldDef[]).filter((f) => f.id && f.label)}
            value={newsForm.custom}
            onChange={(next) => setNewsForm((prev) => ({ ...prev, custom: next }))}
          />

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={newsSave.isPending}
              className="btn btn-primary"
            >
              {newsSave.isPending ? "Saving..." : "Save news"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setNewsForm(defaultNews)}
            >
              Reset
            </button>
            <button
              type="button"
              disabled={!newsForm.id || newsDelete.isPending}
              className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-red-300/70 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                if (!newsForm.id) return;
                if (!confirm(`Delete news "${newsForm.id}"?`)) return;
                newsDelete.mutate(newsForm.id);
              }}
            >
              {newsDelete.isPending ? "Deleting..." : "Delete"}
            </button>
          </div>
        </form>
      </SectionCard>

      <ContentSchemaEditor />
      <ConfigEditor />
      <HomepageEditor />
      <AdminEmailSection />
      <MediaPicker
        open={Boolean(mediaPicker)}
        title={mediaPickerTitle}
        onClose={() => setMediaPicker(null)}
        onSelect={handleSelectMedia}
      />
    </div>
  );
}

export default AdminDashboard;
