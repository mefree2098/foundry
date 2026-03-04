import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { ensureAdmin, getClientPrincipal } from "../auth.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { siteConfigSchema } from "../types/content.js";
import { CodexLoginRequiredError, listCodexModels, startCodexLoginRelay } from "../codex/appServer.js";
import { deriveCodexHomeFromProfile } from "../codex/homeProfile.js";

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

async function aiCodexModels(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };
  const principal = getClientPrincipal(req);
  if (!principal?.userId) return { status: 401, body: "Unauthorized" };

  const queryPath = (req.query.get("codexPath") || "").trim();
  const queryHome = (req.query.get("codexHome") || "").trim();
  const includeHidden = parseBoolean(req.query.get("includeHidden"));
  const startLogin = parseBoolean(req.query.get("startLogin"));

  const stored = await getStoredCodexSettings();
  const finalCodexPath = (queryPath || stored.codexPath || process.env.CODEX_PATH || "codex").trim();
  const fallbackFromProfile = deriveCodexHomeFromProfile(stored.codexHomeProfile, stored.codexAwsVolumeRoot);
  const finalCodexHome = (queryHome || stored.codexHome || fallbackFromProfile || process.env.CODEX_HOME || "").trim() || undefined;

  if (startLogin) {
    try {
      const started = await startCodexLoginRelay({
        ownerId: principal.userId,
        codexPath: finalCodexPath,
        codexHome: finalCodexHome,
        forceLogin: true,
        context,
      });
      if (started?.loginKey && started.authUrl) {
        return {
          status: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "codex",
            includeHidden,
            loginRequired: true,
            authUrl: started.authUrl,
            pendingLoginId: started.loginKey,
            callbackHint: "If login lands on localhost and fails, paste that full URL into Complete login.",
            models: [],
          }),
        };
      }
    } catch (relayErr) {
      const relayMessage = relayErr instanceof Error ? relayErr.message : String(relayErr);
      context.log(`ai-codex-models forced login relay start failed: ${relayMessage}`);
      return { status: 502, body: `Unable to start Codex login session: ${relayMessage}` };
    }
  }

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
      let pendingLoginId: string | undefined;
      let authUrl = err.authUrl;
      if (startLogin) {
        try {
          const started = await startCodexLoginRelay({
            ownerId: principal.userId,
            codexPath: finalCodexPath,
            codexHome: finalCodexHome,
            forceLogin: true,
            context,
          });
          if (!started?.loginKey || !started.authUrl) {
            const message = "Unable to start Codex login session on backend. Try Sign in again.";
            context.log(`ai-codex-models login relay start missing session data: ${JSON.stringify(started || {})}`);
            return { status: 502, body: message };
          }
          pendingLoginId = started.loginKey;
          authUrl = started.authUrl;
        } catch (relayErr) {
          const relayMessage = relayErr instanceof Error ? relayErr.message : String(relayErr);
          context.log(`ai-codex-models login relay start failed: ${relayMessage}`);
          return { status: 502, body: `Unable to start Codex login session: ${relayMessage}` };
        }
      }
      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "codex",
          includeHidden,
          loginRequired: true,
          authUrl,
          pendingLoginId,
          callbackHint: startLogin ? "If login lands on localhost and fails, paste that full URL into Complete login." : undefined,
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
