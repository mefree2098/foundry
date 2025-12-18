import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { siteConfigSchema } from "../types/content.js";
import { getUsageDoc, type UsageBucket } from "../aiUsage.js";

type PricingModel = { inputUsdPerMillion: number; outputUsdPerMillion: number };

type UsageSummary = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
  costUsd: number | null;
};

function sumBuckets(buckets: Record<string, UsageBucket>) {
  return Object.values(buckets).reduce(
    (acc, cur) => {
      acc.promptTokens += cur.promptTokens;
      acc.completionTokens += cur.completionTokens;
      acc.totalTokens += cur.totalTokens;
      acc.requests += cur.requests;
      return acc;
    },
    { promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0 },
  );
}

function costForUsage(usage: UsageBucket, price?: PricingModel) {
  if (!price) return null;
  const inputCost = (usage.promptTokens / 1_000_000) * price.inputUsdPerMillion;
  const outputCost = (usage.completionTokens / 1_000_000) * price.outputUsdPerMillion;
  return Number((inputCost + outputCost).toFixed(6));
}

function normalizeModelKey(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findPricing(model: string, pricing: Record<string, PricingModel>) {
  if (pricing[model]) return pricing[model];
  const normalized = normalizeModelKey(model);
  if (pricing[normalized]) return pricing[normalized];
  const suffixIndex = normalized.indexOf("-20");
  if (suffixIndex > 0) {
    const trimmed = normalized.slice(0, suffixIndex);
    if (pricing[trimmed]) return pricing[trimmed];
  }
  return undefined;
}

function summarizeModels(buckets: Record<string, UsageBucket>, pricing: Record<string, PricingModel>) {
  const byModel: Record<string, UsageSummary> = {};
  let totalCost = 0;
  let costKnown = true;
  for (const [model, usage] of Object.entries(buckets)) {
    const price = findPricing(model, pricing);
    const cost = costForUsage(usage, price);
    if (cost === null) {
      costKnown = false;
    } else {
      totalCost += cost;
    }
    byModel[model] = {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      requests: usage.requests,
      costUsd: cost,
    };
  }
  const totals = sumBuckets(buckets);
  return {
    models: byModel,
    totals: {
      ...totals,
      costUsd: costKnown ? Number(totalCost.toFixed(6)) : null,
    },
  };
}

async function aiUsage(_req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  const auth = ensureAdmin(_req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const usageDoc = await getUsageDoc();

  let pricing: Record<string, PricingModel> = {};
  let pricingSource: string | undefined;
  let pricingUpdatedAt: string | undefined;
  try {
    const { resource } = await database.container(containers.config).item("global", "global").read();
    const parsed = siteConfigSchema.safeParse(resource || {});
    if (parsed.success) {
      pricing = (parsed.data.ai?.pricing?.models as Record<string, PricingModel> | undefined) || {};
      pricingSource = parsed.data.ai?.pricing?.source;
      pricingUpdatedAt = parsed.data.ai?.pricing?.updatedAt;
    }
  } catch {
    pricing = {};
  }

  const days = usageDoc.days || {};
  const now = new Date();
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() - 29);

  const last30Models: Record<string, UsageBucket> = {};
  const last30Images: Record<string, UsageBucket> = {};

  for (const [day, buckets] of Object.entries(days)) {
    const dayDate = new Date(`${day}T00:00:00Z`);
    if (dayDate < cutoff) continue;
    for (const [model, usage] of Object.entries(buckets.models || {})) {
      if (!last30Models[model]) last30Models[model] = { promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0 };
      last30Models[model].promptTokens += usage.promptTokens;
      last30Models[model].completionTokens += usage.completionTokens;
      last30Models[model].totalTokens += usage.totalTokens;
      last30Models[model].requests += usage.requests;
    }
    for (const [model, usage] of Object.entries(buckets.images || {})) {
      if (!last30Images[model]) last30Images[model] = { promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0 };
      last30Images[model].promptTokens += usage.promptTokens;
      last30Images[model].completionTokens += usage.completionTokens;
      last30Images[model].totalTokens += usage.totalTokens;
      last30Images[model].requests += usage.requests;
    }
  }

  const allTimeModels = summarizeModels(usageDoc.totals.models || {}, pricing);
  const allTimeImages = summarizeModels(usageDoc.totals.images || {}, pricing);
  const last30DayModels = summarizeModels(last30Models, pricing);
  const last30DayImages = summarizeModels(last30Images, pricing);

  const response = {
    updatedAt: usageDoc.updatedAt,
    pricing: {
      source: pricingSource || "manual",
      updatedAt: pricingUpdatedAt,
      models: pricing,
    },
    allTime: {
      models: allTimeModels,
      images: allTimeImages,
    },
    last30Days: {
      models: last30DayModels,
      images: last30DayImages,
    },
  };

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(response),
  };
}

app.http("ai-usage", {
  methods: ["GET"],
  route: "ai/usage",
  handler: aiUsage,
});
