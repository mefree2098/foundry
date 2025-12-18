import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../components/SectionCard";
import {
  aiChat,
  type AiChatAction,
  type AiChatMessage,
  fetchConfig,
  fetchNews,
  fetchPlatforms,
  fetchTopics,
  saveConfig,
  saveNews,
  savePlatform,
  saveTopic,
  deleteNews,
  deletePlatform,
  deleteTopic,
} from "../lib/api";

const LS_OPENAI_KEY = "ntr.admin.openai.apiKey";
const LS_OPENAI_MODEL = "ntr.admin.openai.model";

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function AdminAiAssistant() {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: fetchConfig });
  const { data: platforms = [] } = useQuery({ queryKey: ["platforms"], queryFn: fetchPlatforms });
  const { data: topics = [] } = useQuery({ queryKey: ["topics"], queryFn: fetchTopics });
  const { data: news = [] } = useQuery({ queryKey: ["news", { all: true }], queryFn: () => fetchNews() });

  const [apiKey, setApiKey] = useState(() => localStorage.getItem(LS_OPENAI_KEY) || "");
  const [model, setModel] = useState(() => localStorage.getItem(LS_OPENAI_MODEL) || "gpt-4o-mini");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [pendingActions, setPendingActions] = useState<AiChatAction[]>([]);

  useEffect(() => {
    localStorage.setItem(LS_OPENAI_KEY, apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem(LS_OPENAI_MODEL, model);
  }, [model]);

  const context = useMemo(() => {
    return {
      config,
      platforms: platforms.map((p) => ({ id: p.id, name: p.name })),
      topics: topics.map((t) => ({ id: t.id, name: t.name })),
      news: news.map((n) => ({ id: n.id, title: n.title, status: n.status, publishDate: n.publishDate })),
    };
  }, [config, platforms, topics, news]);

  const chat = useMutation({
    mutationFn: (payload: { apiKey: string; model: string; messages: AiChatMessage[] }) =>
      aiChat({ ...payload, context }),
    onError: (err: unknown) => alert(err instanceof Error ? err.message : "AI request failed"),
  });

  const apply = useMutation({
    mutationFn: async (actions: AiChatAction[]) => {
      for (const action of actions) {
        if (action.type === "config.merge") {
          await saveConfig({ id: "global", ...(action.value as any) });
          continue;
        }
        if (action.type === "platform.upsert") {
          await savePlatform(action.value as any);
          continue;
        }
        if (action.type === "topic.upsert") {
          await saveTopic(action.value as any);
          continue;
        }
        if (action.type === "news.upsert") {
          await saveNews(action.value as any);
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
    if (!apiKey.trim() || !model.trim()) {
      alert("Enter an OpenAI API key and model first.");
      return;
    }
    const userMessage: AiChatMessage = { role: "user", content };
    const nextMessages: AiChatMessage[] = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");

    const res = await chat.mutateAsync({ apiKey: apiKey.trim(), model: model.trim(), messages: nextMessages });
    const assistantMessage: AiChatMessage = { role: "assistant", content: res.assistantMessage };
    setMessages((prev) => [...prev, assistantMessage]);
    setPendingActions((res.actions || []).filter(Boolean));
  };

  return (
    <SectionCard title="Admin AI assistant (OpenAI)">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="input-field"
            placeholder="OpenAI API key (stored in this browser only)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <input className="input-field" placeholder="Model (e.g., gpt-4o-mini)" value={model} onChange={(e) => setModel(e.target.value)} />
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
              <button type="button" className="btn btn-primary" disabled={chat.isPending} onClick={send}>
                {chat.isPending ? "Thinking..." : "Send"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setMessages([])} disabled={chat.isPending}>
                Clear chat
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setPendingActions([])} disabled={chat.isPending}>
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
                disabled={apply.isPending || chat.isPending}
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
