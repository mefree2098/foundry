import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { siteConfigSchema } from "../types/content.js";

const defaultConfig = {
  id: "global",
  siteName: "Foundry",
  palette: {
    primary: "#005b50",
  },
  theme: {
    active: "theme1",
  },
  contact: {
    enabled: false,
  },
};

async function getConfig(_req: HttpRequest): Promise<HttpResponseInit> {
  const container = database.container(containers.config);
  const id = "global";
  try {
    const { resource } = await container.item(id, id).read();
    const parsed = siteConfigSchema.safeParse(resource || {});
    if (!parsed.success) {
      return { status: 500, body: "Config validation failed" };
    }
    const hasMailerLiteApiKey = Boolean((parsed.data.emailSettings || {}).mailerLiteApiKey);
    const sanitizedEmailSettings = parsed.data.emailSettings
      ? { ...parsed.data.emailSettings, mailerLiteApiKey: undefined, hasMailerLiteApiKey }
      : undefined;

    const hasOpenAiApiKey = Boolean(parsed.data.ai?.adminAssistant?.openai?.apiKey);
    const sanitizedAi =
      parsed.data.ai?.adminAssistant?.openai || parsed.data.ai?.adminAssistant?.personalities || parsed.data.ai?.adminAssistant?.activePersonalityId
        ? {
            ...(parsed.data.ai || {}),
            adminAssistant: {
              ...(parsed.data.ai?.adminAssistant || {}),
              openai: {
                ...(parsed.data.ai?.adminAssistant?.openai || {}),
                apiKey: undefined,
                clearApiKey: undefined,
                hasApiKey: hasOpenAiApiKey,
              },
            },
          }
        : parsed.data.ai;

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...parsed.data, emailSettings: sanitizedEmailSettings, ai: sanitizedAi }),
    };
  } catch (_err) {
    // If not found or validation fails, fall back to a sensible default
    const fallback = siteConfigSchema.safeParse(defaultConfig);
    const body = fallback.success ? fallback.data : defaultConfig;
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
  }
}

app.http("config-get", {
  methods: ["GET"],
  route: "config",
  handler: getConfig,
});
