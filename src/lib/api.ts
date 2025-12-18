import { QueryClient } from "@tanstack/react-query";
import type { NewsPost, Platform, SiteConfig, Subscriber, Topic } from "./types";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // always refetch on mount to show latest data
      gcTime: 30 * 60 * 1000, // 30 minutes
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
    },
  },
});

const base = import.meta.env.VITE_API_BASE || "/api";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const fetchPlatforms = () => getJson<Platform[]>("/platforms");
export const fetchNews = (params?: { platformId?: string; topic?: string }) => {
  const search = new URLSearchParams();
  if (params?.platformId) search.set("platformId", params.platformId);
  if (params?.topic) search.set("topic", params.topic);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return getJson<NewsPost[]>(`/news${suffix}`);
};
export const fetchTopics = () => getJson<Topic[]>("/topics");
export const fetchConfig = () => getJson<SiteConfig>("/config");

async function sendJson<T>(path: string, method: "POST" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.status === 204 ? (undefined as unknown as T) : ((await res.json()) as T);
}

export const savePlatform = (payload: Platform) => sendJson<Platform>("/platforms", "POST", payload);
export const deletePlatform = (id: string) => sendJson<void>(`/platforms/${id}`, "DELETE");

export const saveTopic = (payload: Topic) => sendJson<Topic>("/topics", "POST", payload);
export const deleteTopic = (id: string) => sendJson<void>(`/topics/${id}`, "DELETE");

export const saveNews = (payload: NewsPost) => sendJson<NewsPost>("/news", "POST", payload);
export const deleteNews = (id: string) => sendJson<void>(`/news/${id}`, "DELETE");

export const saveConfig = (payload: SiteConfig) => sendJson<SiteConfig>("/config", "POST", payload);

export const requestUploadSas = (filename: string, contentType: string) =>
  sendJson<{ uploadUrl: string; blobUrl: string; expiresOn: string }>("/media/sas", "POST", { filename, contentType });

export const subscribe = (payload: { email: string; subscribeAll?: boolean; platformIds?: string[] }) =>
  sendJson<{ ok: boolean }>("/subscriptions", "POST", payload);

export const fetchSubscribers = () => getJson<Subscriber[]>("/subscriptions");

export const sendEmailCampaign = (payload: {
  newsId?: string;
  platformIds?: string[];
  sendToAll?: boolean;
  subject?: string;
  html?: string;
}) => sendJson<{ ok: boolean }>("/email/send", "POST", payload);

export const unsubscribe = (email: string) => sendJson<{ ok?: boolean }>("/subscriptions/unsubscribe", "POST", { email });

export const fetchEmailStats = () =>
  getJson<{
    active: number;
    unsubscribed: number;
    total: number;
    totalSent: number;
    totalFailed: number;
    totalCampaigns: number;
    lastSentAt?: string;
    lastError?: string;
  }>("/email/stats");

export type AiChatMessage = { role: "user" | "assistant"; content: string };
export type AiChatAction =
  | { type: "config.merge"; value: unknown }
  | { type: "platform.upsert"; value: unknown }
  | { type: "topic.upsert"; value: unknown }
  | { type: "news.upsert"; value: unknown }
  | { type: "platform.delete"; id: string }
  | { type: "topic.delete"; id: string }
  | { type: "news.delete"; id: string };

export type AiChatResponse = { assistantMessage: string; actions?: AiChatAction[] };

export const aiChat = (payload: {
  apiKey?: string;
  model?: string;
  messages: AiChatMessage[];
  context?: unknown;
}) => sendJson<AiChatResponse>("/ai/chat", "POST", payload);
