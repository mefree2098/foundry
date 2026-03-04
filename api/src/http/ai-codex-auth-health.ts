import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { ensureAdmin, getClientPrincipal } from "../auth.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { siteConfigSchema } from "../types/content.js";
import { deriveCodexHomeFromProfile } from "../codex/homeProfile.js";
import { probeCodexAuth } from "../codex/appServer.js";

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
      codexHomeProfile: typeof openai?.codexHomeProfile === "string" ? openai.codexHomeProfile : undefined,
      codexAwsVolumeRoot: typeof openai?.codexAwsVolumeRoot === "string" ? openai.codexAwsVolumeRoot : undefined,
    };
  } catch {
    return {};
  }
}

async function aiCodexAuthHealth(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };
  const principal = getClientPrincipal(req);

  const includeModelProbe = req.query.get("includeModelProbe") == null ? true : parseBoolean(req.query.get("includeModelProbe"));
  const queryPath = (req.query.get("codexPath") || "").trim();
  const queryHome = (req.query.get("codexHome") || "").trim();
  const stored = await getStoredCodexSettings();

  const finalCodexPath = (queryPath || stored.codexPath || process.env.CODEX_PATH || "codex").trim();
  const fallbackFromProfile = deriveCodexHomeFromProfile(stored.codexHomeProfile, stored.codexAwsVolumeRoot);
  const finalCodexHome = (queryHome || stored.codexHome || fallbackFromProfile || process.env.CODEX_HOME || "").trim() || undefined;

  try {
    const probe = await probeCodexAuth({
      codexPath: finalCodexPath,
      codexHome: finalCodexHome,
      ownerId: principal?.userId,
      includeModelProbe,
      context,
    });
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "codex",
        timestamp: new Date().toISOString(),
        codexPath: finalCodexPath,
        codexHome: finalCodexHome,
        instance: {
          siteName: (process.env.WEBSITE_SITE_NAME || "").trim() || undefined,
          instanceId: (process.env.WEBSITE_INSTANCE_ID || "").trim() || undefined,
          hostname: (process.env.WEBSITE_HOSTNAME || "").trim() || undefined,
          pid: process.pid,
        },
        ...probe,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.log(`ai-codex-auth-health failed: ${message}`);
    return { status: 502, body: message };
  }
}

app.http("ai-codex-auth-health", {
  methods: ["GET"],
  route: "ai/codex-auth-health",
  handler: aiCodexAuthHealth,
});
