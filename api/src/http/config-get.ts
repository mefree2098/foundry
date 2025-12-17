import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { siteConfigSchema } from "../types/content.js";

const defaultConfig = {
  id: "global",
  palette: {
    primary: "#005b50",
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

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...parsed.data, emailSettings: sanitizedEmailSettings }),
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
