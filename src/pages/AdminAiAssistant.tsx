import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../components/SectionCard";
import {
  aiChat,
  type AiChatAction,
  type AiChatMessage,
  type CodexModelPickerItem,
  completeCodexLogin,
  fetchCodexModels,
  fetchConfig,
  fetchNews,
  fetchPlatforms,
  fetchTopics,
  generateImage,
  saveConfig,
  saveNews,
  savePlatform,
  saveTopic,
  deleteNews,
  deletePlatform,
  deleteTopic,
} from "../lib/api";
import type { SiteConfig } from "../lib/types";

type Personality = { id: string; name: string; prompt: string };
type OpenAiAuthMode = "apiKey" | "codexPath";

const PERSONALITY_PRESETS: Personality[] = [
  {
    id: "professional",
    name: "Professional (default)",
    prompt:
      "Tone: professional, direct, and action-first. Keep explanations brief. When multiple options exist, propose the safest default and ask before risky changes.",
  },
  {
    id: "friendly",
    name: "Friendly",
    prompt:
      "Tone: friendly and encouraging, but still concise. Use plain language. Offer a quick example only when helpful. Stay action-first.",
  },
  {
    id: "ultra-concise",
    name: "Ultra concise",
    prompt:
      "Tone: extremely concise. Prefer short sentences. Avoid extra context unless asked. Still propose actions when possible.",
  },
  {
    id: "creative",
    name: "Creative",
    prompt:
      "Tone: creative and product-minded. Suggest tasteful improvements (especially UI/theming) and propose actions to implement them. Keep output structured and minimal.",
  },
  {
    id: "strict-change-control",
    name: "Strict change control",
    prompt:
      "Tone: cautious and change-controlled. Before proposing destructive actions, ask for confirmation in assistantMessage and return no actions. Prefer small incremental patches.",
  },
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

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncateText(value?: string, maxLength = 2000) {
  const text = (value || "").trim();
  if (!text) return undefined;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n/* ... truncated ... */`;
}

function summarizeConfigForAi(config?: SiteConfig) {
  if (!config) return config;
  const pages = (config.pages || []).map((page) => ({
    id: page.id,
    title: page.title,
    enabled: page.enabled,
    description: page.description,
    height: page.height,
    externalScripts: page.externalScripts,
    html: truncateText(page.html),
    css: truncateText(page.css),
    script: truncateText(page.script),
  }));
  return { ...config, pages };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch as T) ?? base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const cur = (out as any)[k];
    if (Array.isArray(v)) {
      out[k] = v;
    } else if (isPlainObject(cur) && isPlainObject(v)) {
      out[k] = deepMerge(cur, v);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

function setNestedValue<T extends Record<string, any>>(base: T, path: string, value: unknown): T {
  const parts = path.split(".").filter(Boolean);
  if (!parts.length) return base;
  const next: Record<string, any> = Array.isArray(base) ? [...base] : { ...base };
  let cursor: Record<string, any> = next;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const existing = cursor[key];
    cursor[key] = isPlainObject(existing) ? { ...existing } : {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
  return next as T;
}

type LinkItem = { label?: string; url?: string; href?: string };

function normalizeLinks(value: unknown) {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const pairs = value
      .map((item) => item as LinkItem)
      .map((item) => ({
        label: (item.label || "").trim(),
        url: (item.url || item.href || "").trim(),
      }))
      .filter((item) => item.label && item.url);
    return pairs.length ? Object.fromEntries(pairs.map((item) => [item.label, item.url])) : undefined;
  }
  if (typeof value === "object") return value;
  return undefined;
}

function AdminAiAssistant() {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: fetchConfig });
  const { data: platforms = [] } = useQuery({ queryKey: ["platforms"], queryFn: fetchPlatforms });
  const { data: topics = [] } = useQuery({ queryKey: ["topics"], queryFn: fetchTopics });
  const { data: news = [] } = useQuery({ queryKey: ["news", { all: true }], queryFn: () => fetchNews() });

  const [authMode, setAuthMode] = useState<OpenAiAuthMode>("apiKey");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [codexPathDraft, setCodexPathDraft] = useState("");
  const [codexHomeDraft, setCodexHomeDraft] = useState("");
  const [codexPendingLoginId, setCodexPendingLoginId] = useState("");
  const [codexCallbackDraft, setCodexCallbackDraft] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [imageModel, setImageModel] = useState("gpt-image-1.5");
  const [imageSize, setImageSize] = useState("1024x1024");
  const [imageQuality, setImageQuality] = useState<"low" | "medium" | "high" | "auto">("auto");
  const [imageBackground, setImageBackground] = useState<"transparent" | "opaque" | "auto">("auto");
  const [imageOutputFormat, setImageOutputFormat] = useState<"png" | "jpeg" | "webp">("png");
  const [clearStoredKey, setClearStoredKey] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [pendingActions, setPendingActions] = useState<AiChatAction[]>([]);
  const [personalities, setPersonalities] = useState<Personality[]>(PERSONALITY_PRESETS);
  const [activePersonalityId, setActivePersonalityId] = useState<string>(PERSONALITY_PRESETS[0]?.id || "professional");
  const [personalityDirty, setPersonalityDirty] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    if (!config) return;
    if (personalityDirty) return;
    const list = config.ai?.adminAssistant?.personalities;
    const active = config.ai?.adminAssistant?.activePersonalityId;
    const nextList = list?.length ? (list as any as Personality[]) : PERSONALITY_PRESETS;
    const nextActive = (active && nextList.some((p) => p.id === active) ? active : nextList[0]?.id) || "professional";
    setPersonalities(nextList);
    setActivePersonalityId(nextActive);
  }, [config, personalityDirty]);

  useEffect(() => {
    if (!config) return;
    const cfgAuthMode = config.ai?.adminAssistant?.openai?.authMode;
    const cfgModel = config.ai?.adminAssistant?.openai?.model;
    const cfgImageModel = config.ai?.adminAssistant?.openai?.imageModel;
    const cfgImageSize = config.ai?.adminAssistant?.openai?.imageSize;
    const cfgImageQuality = config.ai?.adminAssistant?.openai?.imageQuality;
    const cfgImageBackground = config.ai?.adminAssistant?.openai?.imageBackground;
    const cfgImageOutputFormat = config.ai?.adminAssistant?.openai?.imageOutputFormat;
    const cfgCodexPath = config.ai?.adminAssistant?.openai?.codexPath;
    const cfgCodexHome = config.ai?.adminAssistant?.openai?.codexHome;
    setAuthMode(cfgAuthMode === "codexPath" ? "codexPath" : "apiKey");
    setModel((cfgModel && cfgModel.trim()) || (cfgAuthMode === "codexPath" ? "gpt-5.1-codex" : "gpt-4o-mini"));
    setImageModel((cfgImageModel && cfgImageModel.trim()) || "gpt-image-1.5");
    setImageSize((cfgImageSize && cfgImageSize.trim()) || "1024x1024");
    setImageQuality((cfgImageQuality as any) || "auto");
    setImageBackground((cfgImageBackground as any) || "auto");
    setImageOutputFormat((cfgImageOutputFormat as any) || "png");
    setCodexPathDraft((cfgCodexPath && cfgCodexPath.trim()) || "");
    setCodexHomeDraft((cfgCodexHome && cfgCodexHome.trim()) || "");
    setCodexPendingLoginId("");
    setCodexCallbackDraft("");
    setApiKeyDraft("");
    setClearStoredKey(false);
  }, [config]);

  const context = useMemo(() => {
    const configSummary = summarizeConfigForAi(config);
    return {
      config: configSummary,
      platforms: platforms.map((p) => ({ id: p.id, name: p.name })),
      topics: topics.map((t) => ({ id: t.id, name: t.name })),
      news: news.map((n) => ({ id: n.id, title: n.title, status: n.status, publishDate: n.publishDate })),
    };
  }, [config, platforms, topics, news]);

  const codexModelsQuery = useQuery({
    queryKey: ["ai", "codex-models", authMode],
    queryFn: () =>
      fetchCodexModels({
        codexPath: codexPathDraft.trim() || undefined,
        codexHome: codexHomeDraft.trim() || undefined,
      }),
    enabled: authMode === "codexPath",
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const codexModels = codexModelsQuery.data?.models || [];
  const codexModelOptions = useMemo(() => {
    const options = [...codexModels];
    const currentModel = model.trim();
    if (currentModel && !options.some((item) => item.model === currentModel)) {
      const customOption: CodexModelPickerItem = {
        id: `custom-${currentModel}`,
        model: currentModel,
        displayName: `${currentModel} (custom)`,
        description: "",
        hidden: false,
        isDefault: false,
        supportsPersonality: false,
        inputModalities: [],
        supportedReasoningEfforts: [],
      };
      options.unshift(customOption);
    }
    return options;
  }, [codexModels, model]);

  useEffect(() => {
    if (authMode !== "codexPath") return;
    if (!codexModels.length) return;
    const currentModel = model.trim();
    if (currentModel && codexModels.some((item) => item.model === currentModel)) return;
    const preferred = codexModels.find((item) => item.isDefault) || codexModels[0];
    if (preferred?.model) setModel(preferred.model);
  }, [authMode, codexModels, model]);

  useEffect(() => {
    if (authMode === "codexPath") return;
    setCodexPendingLoginId("");
    setCodexCallbackDraft("");
  }, [authMode]);

  const hasStoredKey = Boolean(config?.ai?.adminAssistant?.openai?.hasApiKey);
  const hasStoredCodexPath = Boolean(
    config?.ai?.adminAssistant?.openai?.hasCodexPath || (config?.ai?.adminAssistant?.openai?.codexPath || "").trim(),
  );
  const configuredAuthMode: OpenAiAuthMode = config?.ai?.adminAssistant?.openai?.authMode === "codexPath" ? "codexPath" : "apiKey";
  const authModeSaved = authMode === configuredAuthMode;

  useEffect(() => {
    const pendingId = codexModelsQuery.data?.pendingLoginId;
    if (!pendingId) return;
    setCodexPendingLoginId(pendingId);
  }, [codexModelsQuery.data?.pendingLoginId]);

  const completeCodexLoginMutation = useMutation({
    mutationFn: async () => {
      const loginId = codexPendingLoginId.trim();
      const callbackUrl = codexCallbackDraft.trim();
      if (!callbackUrl) {
        throw new Error("Paste the localhost callback URL from your browser first.");
      }
      await completeCodexLogin({
        loginId: loginId || undefined,
        callbackUrl,
        codexPath: codexPathDraft.trim() || undefined,
        codexHome: codexHomeDraft.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setCodexCallbackDraft("");
      setCodexPendingLoginId("");
      const refreshed = await codexModelsQuery.refetch();
      const payload = refreshed.data;
      if (payload?.loginRequired) {
        alert(
          "Codex callback was accepted, but login is still required on this server worker. Try Refresh model list. If this persists, set/save a shared Codex home path so all workers use the same login state.",
        );
        return;
      }
      if (payload?.models?.length) {
        alert(`Codex login completed. ${payload.models.length} model${payload.models.length === 1 ? "" : "s"} loaded.`);
        return;
      }
      alert("Codex login completed, but no models were returned yet. Click Refresh model list.");
    },
    onError: (err: unknown) => {
      alert(err instanceof Error ? err.message : "Failed to complete Codex login");
    },
  });

  const openCodexLogin = async () => {
    let payload: Awaited<ReturnType<typeof fetchCodexModels>> | undefined;
    try {
      payload = await fetchCodexModels({
        codexPath: codexPathDraft.trim() || undefined,
        codexHome: codexHomeDraft.trim() || undefined,
        startLogin: true,
      });
      queryClient.setQueryData(["ai", "codex-models", authMode], payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to reach Codex backend.";
      alert(`Codex backend error: ${message}`);
      return;
    }
    const authUrl = payload?.loginRequired ? payload.authUrl : undefined;
    if (payload?.pendingLoginId) {
      setCodexPendingLoginId(payload.pendingLoginId);
    }
    if (authUrl) {
      window.open(authUrl, "_blank");
      return;
    }
    if (payload?.models?.length) {
      alert("Codex is already connected to OpenAI.");
      return;
    }
    alert(
      "Codex backend returned no login URL and no models. This usually means Codex is not installed/configured on the server (CODEX_PATH/CODEX_HOME).",
    );
  };

  const saveOpenAiSettings = useMutation({
    mutationFn: async () => {
      const base = config || ({ id: "global" } as any);
      const openaiPatch: any = {
        authMode,
        model: model.trim() || (authMode === "codexPath" ? "gpt-5.1-codex" : "gpt-4o-mini"),
        imageModel: imageModel.trim() || "gpt-image-1.5",
        imageSize: imageSize.trim() || "1024x1024",
        imageQuality,
        imageBackground,
        imageOutputFormat,
        codexPath: codexPathDraft,
        codexHome: codexHomeDraft,
      };
      if (clearStoredKey) {
        openaiPatch.clearApiKey = true;
      } else if (apiKeyDraft.trim()) {
        openaiPatch.apiKey = apiKeyDraft.trim();
      }
      const patch = { ai: { adminAssistant: { openai: openaiPatch } } };
      const next = deepMerge(base, patch);
      await saveConfig(next as any);
    },
    onSuccess: async () => {
      setApiKeyDraft("");
      setClearStoredKey(false);
      await queryClient.invalidateQueries({ queryKey: ["config"] });
    },
    onError: (err: unknown) => alert(err instanceof Error ? err.message : "Failed to save OpenAI settings"),
  });

  const savePersonalityConfig = useMutation({
    mutationFn: async () => {
      const base = config || ({ id: "global" } as any);
      const patch = { ai: { adminAssistant: { personalities, activePersonalityId } } };
      const next = deepMerge(base, patch);
      await saveConfig(next as any);
    },
    onSuccess: async () => {
      setPersonalityDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["config"] });
    },
    onError: (err: unknown) => alert(err instanceof Error ? err.message : "Failed to save personality settings"),
  });

  const apply = useMutation({
    mutationFn: async (actions: AiChatAction[]) => {
      for (const action of actions) {
        if (action.type === "config.merge") {
          const base = config || ({ id: "global" } as any);
          const merged = deepMerge(base, action.value);
          await saveConfig({ ...(merged as any), id: "global" });
          continue;
        }
        if (action.type === "platform.upsert") {
          const payload = { ...(action.value as any) };
          payload.links = normalizeLinks(payload.links);
          await savePlatform(payload as any);
          continue;
        }
        if (action.type === "topic.upsert") {
          await saveTopic(action.value as any);
          continue;
        }
        if (action.type === "news.upsert") {
          const payload = { ...(action.value as any) };
          payload.links = normalizeLinks(payload.links);
          await saveNews(payload as any);
          continue;
        }
        if (action.type === "platform.delete") {
          await deletePlatform(action.id);
          continue;
        }
        if (action.type === "topic.delete") {
          await deleteTopic(action.id);
          continue;
        }
        if (action.type === "news.delete") {
          await deleteNews(action.id);
          continue;
        }
        if (action.type === "media.generate") {
          const payload = action.value || ({} as any);
          const prompt = String(payload.prompt || "").trim();
          if (!prompt) throw new Error("Missing image prompt.");
          if (!confirm(`Generate image with OpenAI and update ${payload.targetType}?`)) continue;
          const result = await generateImage({
            prompt,
            size: payload.size,
            quality: payload.quality,
            background: payload.background,
            filenameHint: payload.targetId || payload.targetType,
          });
          const field = String(payload.field || "").trim();
          if (!field) throw new Error("Missing target field for image placement.");
          if (payload.targetType === "config") {
            const base = config || ({ id: "global" } as any);
            const next = setNestedValue(base, field, result.blobUrl);
            await saveConfig(next as any);
            continue;
          }
          if (payload.targetType === "platform") {
            const existing = platforms.find((p) => p.id === payload.targetId);
            if (!existing) throw new Error(`Platform ${payload.targetId} not found`);
            const next = setNestedValue({ ...(existing as any) }, field, result.blobUrl);
            await savePlatform(next as any);
            continue;
          }
          if (payload.targetType === "news") {
            const existing = news.find((n) => n.id === payload.targetId);
            if (!existing) throw new Error(`News ${payload.targetId} not found`);
            const next = setNestedValue({ ...(existing as any) }, field, result.blobUrl);
            await saveNews(next as any);
            continue;
          }
        }
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["config"] });
      await queryClient.invalidateQueries({ queryKey: ["platforms"] });
      await queryClient.invalidateQueries({ queryKey: ["topics"] });
      await queryClient.invalidateQueries({ queryKey: ["news"] });
      await queryClient.invalidateQueries({ queryKey: ["news", { all: true }] });
      setPendingActions([]);
    },
    onError: (err: unknown) => alert(err instanceof Error ? err.message : "Failed to apply actions"),
  });

  const send = async () => {
    const content = draft.trim();
    if (!content) return;
    if (configuredAuthMode === "apiKey" && !hasStoredKey) {
      alert("No OpenAI API key saved yet. Save it under OpenAI settings first.");
      return;
    }
    const userMessage: AiChatMessage = { role: "user", content };
    const nextMessages: AiChatMessage[] = [...messages, userMessage];
    setMessages([...nextMessages, { role: "assistant", content: "Working on it..." }]);
    setDraft("");
    setPendingActions([]);
    setIsStreaming(true);

    const finalizeAssistant = (assistantMessage: string, actions: AiChatAction[]) => {
      setMessages((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i -= 1) {
          if (next[i].role === "assistant") {
            next[i] = { ...next[i], content: assistantMessage };
            return next;
          }
        }
        next.push({ role: "assistant", content: assistantMessage });
        return next;
      });
      setPendingActions((actions || []).filter(Boolean));
    };

    try {
      const res = await aiChat({ messages: nextMessages.slice(-10), context });
      finalizeAssistant(String(res.assistantMessage || ""), res.actions || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI request failed";
      alert(message);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <SectionCard title="Admin AI assistant (OpenAI / Codex)">
      <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs text-slate-300">OpenAI settings</div>
              <div className="text-xs text-slate-400">
                {authMode === "apiKey"
                  ? hasStoredKey
                    ? "Auth mode: API key. Key is saved (hidden)."
                    : "Auth mode: API key. No API key saved yet."
                  : hasStoredCodexPath
                    ? "Auth mode: Codex subscription. Codex path is saved."
                    : "Auth mode: Codex subscription. Using PATH lookup unless you set a codex path."}{" "}
                {!authModeSaved ? "Not saved yet. " : ""}
                Leave API key blank to keep the stored key.
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saveOpenAiSettings.isPending}
              onClick={() => saveOpenAiSettings.mutate()}
            >
              {saveOpenAiSettings.isPending ? "Saving..." : "Save OpenAI settings"}
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <select className="input-field" value={authMode} onChange={(e) => setAuthMode(e.target.value as OpenAiAuthMode)}>
              <option value="apiKey">Auth mode: OpenAI API key</option>
              <option value="codexPath">Auth mode: Codex subscription</option>
            </select>
            <input
              className="input-field"
              placeholder={hasStoredKey ? "•••••••••••••••• (stored, hidden)" : "OpenAI API key"}
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
            />
            <input
              className="input-field"
              placeholder={hasStoredCodexPath ? "Codex path (stored)" : "Codex path (optional, defaults to `codex`)"}
              value={codexPathDraft}
              onChange={(e) => setCodexPathDraft(e.target.value)}
            />
            <input
              className="input-field"
              placeholder="Codex home (optional, keeps subscription login state)"
              value={codexHomeDraft}
              onChange={(e) => setCodexHomeDraft(e.target.value)}
            />
            {authMode === "codexPath" ? (
              <div className="md:col-span-2 space-y-2">
                <select className="input-field" value={model} onChange={(e) => setModel(e.target.value)} disabled={codexModelsQuery.isLoading}>
                  {codexModelOptions.length ? (
                    codexModelOptions.map((item) => (
                      <option key={item.id} value={item.model}>
                        {item.displayName}
                        {item.hidden ? " (hidden)" : ""}
                      </option>
                    ))
                  ) : (
                    <option value={model || ""}>{codexModelsQuery.isLoading ? "Loading models..." : "No models returned"}</option>
                  )}
                </select>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={openCodexLogin}
                    disabled={codexModelsQuery.isFetching}
                  >
                    {codexModelsQuery.isFetching ? "Checking login..." : "Sign in to OpenAI"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => codexModelsQuery.refetch()}
                    disabled={codexModelsQuery.isFetching}
                  >
                    {codexModelsQuery.isFetching ? "Refreshing models..." : "Refresh model list"}
                  </button>
                  <div className="text-xs text-slate-300">
                    {codexModelsQuery.data?.loginRequired ? (
                      <>
                        OpenAI login required for Codex.{" "}
                        {codexModelsQuery.data.authUrl ? (
                          <a className="underline text-slate-200" href={codexModelsQuery.data.authUrl} target="_blank" rel="noreferrer">
                            Open login URL
                          </a>
                        ) : null}
                        {codexModelsQuery.data.callbackHint ? ` ${codexModelsQuery.data.callbackHint}` : ""}
                      </>
                    ) : codexModelsQuery.isError ? (
                      codexModelsQuery.error instanceof Error ? codexModelsQuery.error.message : "Failed to load models."
                    ) : codexModels.length ? (
                      `${codexModels.length} models available from Codex.`
                    ) : (
                      "No Codex models available yet. If this is hosted, ensure server-side CODEX_PATH/CODEX_HOME are configured."
                    )}
                  </div>
                </div>
                {codexModelsQuery.data?.loginRequired ? (
                  <div className="rounded-md border border-slate-500/40 bg-slate-900/30 p-3 space-y-2">
                    <div className="text-xs text-slate-200">
                      After OpenAI login, if you land on a localhost error page, copy the full URL from that browser tab and paste it here.
                    </div>
                    <input
                      className="input-field"
                      placeholder="http://localhost:1455/auth/callback?code=...&state=..."
                      value={codexCallbackDraft}
                      onChange={(e) => setCodexCallbackDraft(e.target.value)}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => completeCodexLoginMutation.mutate()}
                        disabled={completeCodexLoginMutation.isPending || !codexCallbackDraft.trim()}
                      >
                        {completeCodexLoginMutation.isPending ? "Completing login..." : "Complete login"}
                      </button>
                      {!codexPendingLoginId.trim() ? <span className="text-xs text-slate-300">No pending id detected; callback-only completion will be attempted.</span> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <input className="input-field" placeholder="Model (e.g., gpt-4o-mini)" value={model} onChange={(e) => setModel(e.target.value)} />
            )}
            <input
              className="input-field"
              placeholder="Image model (e.g., gpt-image-1.5)"
              value={imageModel}
              onChange={(e) => setImageModel(e.target.value)}
            />
            <input
              className="input-field"
              placeholder="Image size (e.g., 1024x1024)"
              value={imageSize}
              onChange={(e) => setImageSize(e.target.value)}
            />
            <select className="input-field" value={imageQuality} onChange={(e) => setImageQuality(e.target.value as any)}>
              <option value="auto">Image quality: auto</option>
              <option value="low">Image quality: low</option>
              <option value="medium">Image quality: medium</option>
              <option value="high">Image quality: high</option>
            </select>
            <select className="input-field" value={imageBackground} onChange={(e) => setImageBackground(e.target.value as any)}>
              <option value="auto">Background: auto</option>
              <option value="transparent">Background: transparent</option>
              <option value="opaque">Background: opaque</option>
            </select>
            <select className="input-field" value={imageOutputFormat} onChange={(e) => setImageOutputFormat(e.target.value as any)}>
              <option value="png">Output format: png</option>
              <option value="jpeg">Output format: jpeg</option>
              <option value="webp">Output format: webp</option>
            </select>
            <label className="md:col-span-2 flex items-center gap-2 text-xs text-slate-200">
              <input
                type="checkbox"
                checked={clearStoredKey}
                onChange={(e) => setClearStoredKey(e.target.checked)}
                disabled={!hasStoredKey}
              />
              Clear stored API key
            </label>
            <div className="md:col-span-2 text-xs text-slate-300">Note: image generation still uses the OpenAI API key path.</div>
            <div className="md:col-span-2 text-xs text-slate-300">
              Model list:{" "}
              <a className="underline text-slate-200" href="https://platform.openai.com/docs/models" target="_blank" rel="noreferrer">
                platform.openai.com/docs/models
              </a>{" "}
              · Pricing:{" "}
              <a className="underline text-slate-200" href="https://platform.openai.com/pricing" target="_blank" rel="noreferrer">
                platform.openai.com/pricing
              </a>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs text-slate-300">AI personality</div>
              <div className="text-xs text-slate-400">Sets tone/style only. Platform training is built-in and not editable.</div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setPersonalities(PERSONALITY_PRESETS);
                  setActivePersonalityId(PERSONALITY_PRESETS[0]?.id || "professional");
                  setPersonalityDirty(true);
                }}
              >
                Reset to default
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={savePersonalityConfig.isPending}
                onClick={() => savePersonalityConfig.mutate()}
              >
                {savePersonalityConfig.isPending ? "Saving..." : "Save personality"}
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-[260px_1fr_auto] items-start">
            <select
              className="input-field"
              value={activePersonalityId}
              onChange={(e) => {
                setActivePersonalityId(e.target.value);
                setPersonalityDirty(true);
              }}
            >
              {personalities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="text-xs text-slate-300 pt-2">Edit the selected personality prompt, or create your own.</div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const name = prompt("Personality name:");
                if (!name) return;
                const ids = new Set(personalities.map((p) => p.id));
                const id = ensureUniqueId(ids, slugify(name) || "custom");
                const next = [...personalities, { id, name: name.trim(), prompt: "Tone: " }];
                setPersonalities(next);
                setActivePersonalityId(id);
                setPersonalityDirty(true);
              }}
            >
              New
            </button>
          </div>

          {(() => {
            const idx = personalities.findIndex((p) => p.id === activePersonalityId);
            const selected = idx >= 0 ? personalities[idx] : personalities[0];
            if (!selected) return null;
            return (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      const nextName = prompt("Rename personality:", selected.name);
                      if (!nextName) return;
                      const next = [...personalities];
                      next[idx] = { ...next[idx], name: nextName.trim() };
                      setPersonalities(next);
                      setPersonalityDirty(true);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={personalities.length <= 1}
                    onClick={() => {
                      if (personalities.length <= 1) return;
                      if (!confirm(`Delete personality "${selected.name}"?`)) return;
                      const next = personalities.filter((p) => p.id !== selected.id);
                      setPersonalities(next);
                      setActivePersonalityId(next[0]?.id || "professional");
                      setPersonalityDirty(true);
                    }}
                  >
                    Delete
                  </button>
                </div>
                <textarea
                  className="input-field min-h-[160px]"
                  value={selected.prompt || ""}
                  onChange={(e) => {
                    const next = [...personalities];
                    next[idx] = { ...next[idx], prompt: e.target.value };
                    setPersonalities(next);
                    setPersonalityDirty(true);
                  }}
                />
              </div>
            );
          })()}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-slate-300 mb-3">Chat</div>
          <div className="space-y-3">
            {messages.length ? (
              messages.map((m, idx) => (
                <div key={idx} className={m.role === "user" ? "text-slate-100" : "text-slate-200"}>
                  <div className="text-xs text-slate-400 mb-1">{m.role === "user" ? "You" : "Assistant"}</div>
                  <div className="whitespace-pre-line text-sm">{m.content}</div>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-400">
                Try: “Create a new homepage CTA section with primary button to /platforms” or “Make Theme 2 panels more emerald and keep buttons black”.
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-2">
            <textarea
              className="input-field min-h-[90px]"
              placeholder="Ask the assistant to edit navigation, homepage sections, theming, or content…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" disabled={isStreaming} onClick={send}>
                {isStreaming ? "Streaming..." : "Send"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setMessages([])} disabled={isStreaming}>
                Clear chat
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setPendingActions([])} disabled={isStreaming}>
                Clear actions
              </button>
            </div>
          </div>
        </div>

        {pendingActions.length ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-300">Proposed actions</div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={apply.isPending || isStreaming}
                onClick={() => apply.mutate(pendingActions)}
              >
                {apply.isPending ? "Applying..." : "Apply actions"}
              </button>
            </div>
            <pre className="mt-3 max-h-[280px] overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-200">
              {safeJson(pendingActions)}
            </pre>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

export default AdminAiAssistant;
