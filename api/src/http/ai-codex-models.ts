import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { siteConfigSchema } from "../types/content.js";
import { CodexLoginRequiredError, listCodexModels } from "../codex/appServer.js";

function parseBoolean(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

async function getStoredCodexSettings() {
  try {
    const container = database.container(containers.config);
    const id = "global";
    const { resource } = await container.item(id, id).read();
    const parsed = siteConfigSchema.safeParse(resource || {});
    if (!parsed.success) {
      return {};
    }
    const openai = parsed.data.ai?.adminAssistant?.openai;
    return {
      codexPath: typeof openai?.codexPath === "string" ? openai.codexPath : undefined,
      codexHome: typeof openai?.codexHome === "string" ? openai.codexHome : undefined,
    };
  } catch {
    return {};
  }
}

async function aiCodexModels(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const queryPath = (req.query.get("codexPath") || "").trim();
  const queryHome = (req.query.get("codexHome") || "").trim();
  const includeHidden = parseBoolean(req.query.get("includeHidden"));

  const stored = await getStoredCodexSettings();
  const finalCodexPath = (queryPath || stored.codexPath || process.env.CODEX_PATH || "codex").trim();
  const finalCodexHome = (queryHome || stored.codexHome || process.env.CODEX_HOME || "").trim() || undefined;

  try {
    const models = await listCodexModels({
      codexPath: finalCodexPath,
      codexHome: finalCodexHome,
      includeHidden,
      context,
    });
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "codex",
        includeHidden,
        loginRequired: false,
        models,
      }),
    };
  } catch (err) {
    if (err instanceof CodexLoginRequiredError) {
      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "codex",
          includeHidden,
          loginRequired: true,
          authUrl: err.authUrl,
          models: [],
        }),
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    context.log(`ai-codex-models failed: ${message}`);
    return { status: 502, body: message };
  }
}

app.http("ai-codex-models", {
  methods: ["GET"],
  route: "ai/codex-models",
  handler: aiCodexModels,
});

