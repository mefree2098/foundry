import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { siteConfigSchema, type SiteConfig } from "../types/content.js";

type PricingModel = { inputUsdPerMillion: number; outputUsdPerMillion: number };

type PricingResult = {
  models: Record<string, PricingModel>;
  source: string;
  updatedAt: string;
  note?: string;
};

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractPricingFromObject(obj: unknown, out: Record<string, PricingModel>) {
  if (!obj) return;
  if (Array.isArray(obj)) {
    for (const item of obj) extractPricingFromObject(item, out);
    return;
  }
  if (typeof obj !== "object") return;

  const anyObj = obj as Record<string, unknown>;
  const modelId = (anyObj.model || anyObj.id || anyObj.name) as string | undefined;
  const inputRaw = anyObj.input || anyObj.prompt || anyObj.input_price || anyObj.inputPrice;
  const outputRaw = anyObj.output || anyObj.completion || anyObj.output_price || anyObj.outputPrice;

  const input = parseNumber(inputRaw);
  const output = parseNumber(outputRaw);

  if (modelId && input !== null && output !== null) {
    out[String(modelId)] = { inputUsdPerMillion: input, outputUsdPerMillion: output };
  }

  for (const value of Object.values(anyObj)) {
    extractPricingFromObject(value, out);
  }
}

function extractNextData(html: string) {
  const marker = "__NEXT_DATA__";
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const scriptStart = html.lastIndexOf("<script", idx);
  const jsonStart = html.indexOf(">", idx);
  const jsonEnd = html.indexOf("</script>", jsonStart + 1);
  if (scriptStart === -1 || jsonStart === -1 || jsonEnd === -1) return null;
  const json = html.slice(jsonStart + 1, jsonEnd).trim();
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizeModelKey(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parsePricingText(text: string) {
  const models: Record<string, PricingModel> = {};
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let currentModel: string | null = null;
  let pendingInput: number | null = null;
  let pendingOutput: number | null = null;
  let expecting: "input" | "output" | null = null;

  const commit = () => {
    if (!currentModel) return;
    if (pendingInput == null || pendingOutput == null) return;
    const key = normalizeModelKey(currentModel);
    if (!key) return;
    models[key] = { inputUsdPerMillion: pendingInput, outputUsdPerMillion: pendingOutput };
  };

  const isModelLine = (line: string) => {
    const lower = line.toLowerCase();
    if (!/^(gpt|o[0-9]|sora)/.test(lower)) return false;
    if (lower.includes("price") || lower.includes("input") || lower.includes("output") || lower.includes("cached")) return false;
    if (lower.includes("tokens") || lower.includes("api") || lower.includes("models")) return false;
    return true;
  };

  for (const line of lines) {
    const singleLine = line.match(
      /^([a-z0-9][a-z0-9 .-]*)\s+\$([0-9.]+)\s*\/\s*1m\s*input tokens.*?\$([0-9.]+)\s*\/\s*1m\s*output tokens/i,
    );
    if (singleLine) {
      const [, modelName, inputStr, outputStr] = singleLine;
      const input = parseNumber(inputStr);
      const output = parseNumber(outputStr);
      if (input != null && output != null) {
        currentModel = modelName;
        pendingInput = input;
        pendingOutput = output;
        commit();
      }
      expecting = null;
      continue;
    }

    if (isModelLine(line)) {
      commit();
      currentModel = line;
      pendingInput = null;
      pendingOutput = null;
      expecting = null;
      continue;
    }

    const inputMatch = line.match(/Input:\s*\$?([0-9.]+)/i);
    if (inputMatch) {
      const value = parseNumber(inputMatch[1]);
      if (value != null) pendingInput = value;
      expecting = "input";
      continue;
    }
    if (/^Input:\s*$/i.test(line)) {
      expecting = "input";
      continue;
    }

    const outputMatch = line.match(/Output:\s*\$?([0-9.]+)/i);
    if (outputMatch) {
      const value = parseNumber(outputMatch[1]);
      if (value != null) pendingOutput = value;
      expecting = "output";
      continue;
    }
    if (/^Output:\s*$/i.test(line)) {
      expecting = "output";
      continue;
    }

    const inlineInput = line.match(/\$([0-9.]+).*input tokens/i);
    if (inlineInput) {
      const value = parseNumber(inlineInput[1]);
      if (value != null) pendingInput = value;
      continue;
    }

    const inlineOutput = line.match(/\$([0-9.]+).*output tokens/i);
    if (inlineOutput) {
      const value = parseNumber(inlineOutput[1]);
      if (value != null) pendingOutput = value;
      continue;
    }

    if (expecting) {
      const valueMatch = line.match(/\$([0-9.]+)/);
      if (valueMatch) {
        const value = parseNumber(valueMatch[1]);
        if (value != null) {
          if (expecting === "input") pendingInput = value;
          if (expecting === "output") pendingOutput = value;
          expecting = null;
        }
      }
    }
  }

  commit();
  return models;
}

async function fetchOpenAiPricing(): Promise<PricingResult | null> {
  const urls = ["https://openai.com/api/pricing/?utm_source=chatgpt.com", "https://openai.com/api/pricing/", "https://platform.openai.com/docs/pricing"];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "FoundryPricingFetcher/1.0",
          Accept: "application/json, text/html;q=0.9",
        },
      });
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") || "";
      const text = await res.text();
      const models: Record<string, PricingModel> = {};

      if (contentType.includes("application/json")) {
        try {
          const json = JSON.parse(text);
          extractPricingFromObject(json, models);
        } catch {
          // ignore parse error
        }
      } else {
        const nextData = extractNextData(text);
        if (nextData) extractPricingFromObject(nextData, models);
      }

      if (Object.keys(models).length) {
        return {
          models,
          source: url,
          updatedAt: new Date().toISOString(),
        };
      }
    } catch {
      // ignore
    }
  }
  return null;
}

async function readConfig() {
  const container = database.container(containers.config);
  const id = "global";
  const { resource } = await container.item(id, id).read<SiteConfig>();
  return resource;
}

async function writePricing(nextPricing: PricingResult, existing?: SiteConfig) {
  const container = database.container(containers.config);
  const base = existing || ({ id: "global" } as SiteConfig);
  const nextConfig: SiteConfig = {
    ...base,
    ai: {
      ...(base.ai || {}),
      pricing: {
        source: nextPricing.source,
        updatedAt: nextPricing.updatedAt,
        models: nextPricing.models,
      },
    },
  } as SiteConfig;
  await container.items.upsert(nextConfig);
  return nextConfig.ai?.pricing;
}

async function getPricing(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  try {
    const cfg = await readConfig();
    const parsed = siteConfigSchema.safeParse(cfg || {});
    if (parsed.success && parsed.data.ai?.pricing) {
      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data.ai.pricing),
      };
    }
  } catch {
    // ignore
  }

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "manual", models: {} }),
  };
}

async function refreshPricing(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  let payload: any = undefined;
  try {
    payload = await req.json();
  } catch {
    payload = undefined;
  }

  let existing: SiteConfig | undefined;
  try {
    existing = (await readConfig()) || undefined;
  } catch {
    existing = undefined;
  }

  const pricingText = typeof payload?.pricingText === "string" ? payload.pricingText : undefined;
  if (pricingText) {
    const models = parsePricingText(pricingText);
    if (!Object.keys(models).length) {
      return { status: 400, body: "No pricing models could be parsed from the provided text." };
    }
    const saved = await writePricing(
      { models, source: "manual:text", updatedAt: new Date().toISOString() },
      existing,
    );
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saved),
    };
  }

  if (payload?.models && typeof payload.models === "object") {
    const models: Record<string, PricingModel> = {};
    for (const [key, value] of Object.entries(payload.models as Record<string, any>)) {
      const input = parseNumber(value?.inputUsdPerMillion);
      const output = parseNumber(value?.outputUsdPerMillion);
      if (input == null || output == null) continue;
      const modelKey = normalizeModelKey(key);
      if (!modelKey) continue;
      models[modelKey] = { inputUsdPerMillion: input, outputUsdPerMillion: output };
    }
    if (!Object.keys(models).length) {
      return { status: 400, body: "No valid pricing models found in the payload." };
    }
    const saved = await writePricing(
      { models, source: "manual:json", updatedAt: new Date().toISOString() },
      existing,
    );
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saved),
    };
  }

  const fetched = await fetchOpenAiPricing();
  if (!fetched) {
    context.log("OpenAI pricing fetch failed or returned no models.");
    return { status: 502, body: "Unable to fetch pricing from OpenAI. You can set pricing manually in Admin > AI usage." };
  }

  const saved = await writePricing(fetched, existing);
  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(saved),
  };
}

app.http("ai-pricing", {
  methods: ["GET"],
  route: "ai/pricing",
  handler: getPricing,
});

app.http("ai-pricing-refresh", {
  methods: ["POST"],
  route: "ai/pricing/refresh",
  handler: refreshPricing,
});
