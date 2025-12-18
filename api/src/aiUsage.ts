import { database } from "./client.js";
import { containers } from "./cosmos.js";

const STATS_ID = "stats-ai";

export type UsageBucket = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
};

export type UsageDoc = {
  id: string;
  type: "ai-usage";
  updatedAt: string;
  days: Record<string, { models: Record<string, UsageBucket>; images: Record<string, UsageBucket> }>;
  totals: { models: Record<string, UsageBucket>; images: Record<string, UsageBucket> };
};

function emptyBucket(): UsageBucket {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0 };
}

function ensureBucket(map: Record<string, UsageBucket>, key: string) {
  if (!map[key]) map[key] = emptyBucket();
  return map[key];
}

function applyUsage(target: UsageBucket, usage: { promptTokens: number; completionTokens: number; totalTokens: number }) {
  target.promptTokens += usage.promptTokens;
  target.completionTokens += usage.completionTokens;
  target.totalTokens += usage.totalTokens;
  target.requests += 1;
}

function dayKey(ts: Date) {
  return ts.toISOString().slice(0, 10);
}

async function loadUsageDoc(): Promise<UsageDoc> {
  const container = database.container(containers.config);
  try {
    const { resource } = await container.item(STATS_ID, STATS_ID).read<UsageDoc>();
    if (resource) return resource;
  } catch {
    // ignore missing doc
  }
  return {
    id: STATS_ID,
    type: "ai-usage",
    updatedAt: new Date().toISOString(),
    days: {},
    totals: { models: {}, images: {} },
  };
}

async function saveUsageDoc(doc: UsageDoc) {
  const container = database.container(containers.config);
  await container.items.upsert(doc);
}

export async function recordChatUsage(
  model: string,
  usage: { promptTokens: number; completionTokens: number; totalTokens: number },
  timestamp = new Date(),
) {
  if (!model) return;
  const doc = await loadUsageDoc();
  const day = dayKey(timestamp);
  if (!doc.days[day]) {
    doc.days[day] = { models: {}, images: {} };
  }

  const modelKey = model.trim();
  applyUsage(ensureBucket(doc.days[day].models, modelKey), usage);
  applyUsage(ensureBucket(doc.totals.models, modelKey), usage);

  doc.updatedAt = new Date().toISOString();
  await saveUsageDoc(doc);
}

export async function recordImageUsage(
  model: string,
  usage: { promptTokens: number; completionTokens: number; totalTokens: number },
  timestamp = new Date(),
) {
  if (!model) return;
  const doc = await loadUsageDoc();
  const day = dayKey(timestamp);
  if (!doc.days[day]) {
    doc.days[day] = { models: {}, images: {} };
  }

  const modelKey = model.trim();
  applyUsage(ensureBucket(doc.days[day].images, modelKey), usage);
  applyUsage(ensureBucket(doc.totals.images, modelKey), usage);

  doc.updatedAt = new Date().toISOString();
  await saveUsageDoc(doc);
}

export async function getUsageDoc() {
  return loadUsageDoc();
}
