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

async function fetchOpenAiPricing(): Promise<PricingResult | null> {
  const urls = ["https://openai.com/api/pricing/", "https://platform.openai.com/docs/pricing"];
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

  let existing: SiteConfig | undefined;
  try {
    existing = (await readConfig()) || undefined;
  } catch {
    existing = undefined;
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
