import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { z } from "zod";
import { ensureAdmin, getClientPrincipal } from "../auth.js";
import { completeCodexLoginRelay, completeCodexLoginViaCallback, probeCodexAuth } from "../codex/appServer.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { siteConfigSchema } from "../types/content.js";
import { deriveCodexHomeFromProfile } from "../codex/homeProfile.js";

const requestSchema = z.object({
  loginId: z.string().min(1).optional(),
  callbackUrl: z.string().min(1),
  codexPath: z.string().optional(),
  codexHome: z.string().optional(),
});

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

async function aiCodexLoginComplete(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };
  const principal = getClientPrincipal(req);
  if (!principal?.userId) return { status: 401, body: "Unauthorized" };

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { status: 400, body: "Invalid JSON body." };
  }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: 400, body: JSON.stringify(parsed.error.flatten()) };
  }

  const stored = await getStoredCodexSettings();
  const finalCodexPath = (parsed.data.codexPath || stored.codexPath || process.env.CODEX_PATH || "codex").trim();
  const fallbackFromProfile = deriveCodexHomeFromProfile(stored.codexHomeProfile, stored.codexAwsVolumeRoot);
  const finalCodexHome = (parsed.data.codexHome || stored.codexHome || fallbackFromProfile || process.env.CODEX_HOME || "").trim() || undefined;
  const loginId = (parsed.data.loginId || "").trim();
  let relayErrorMessage = "";

  if (loginId) {
    try {
      await completeCodexLoginRelay({
        ownerId: principal.userId,
        loginKey: loginId,
        callbackUrlOrQuery: parsed.data.callbackUrl,
        context,
      });
      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, mode: "relay" }),
      };
    } catch (error) {
      relayErrorMessage = error instanceof Error ? error.message : String(error);
      context.log(`ai-codex-login-complete relay failed: ${relayErrorMessage}`);
      if (relayErrorMessage.toLowerCase().includes("timed out waiting for codex login completion")) {
        try {
          const probe = await probeCodexAuth({
            codexPath: finalCodexPath,
            codexHome: finalCodexHome,
            includeModelProbe: false,
            context,
          });
          if (probe.authenticated && !probe.loginRequired) {
            return {
              status: 200,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ success: true, mode: "relay-timeout-authenticated" }),
            };
          }
        } catch {
          // Keep fallback path.
        }
      }
    }
  }

  try {
    await completeCodexLoginViaCallback({
      callbackUrlOrQuery: parsed.data.callbackUrl,
      codexPath: finalCodexPath,
      codexHome: finalCodexHome,
      context,
    });
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, mode: "fallback" }),
    };
  } catch (fallbackError) {
    const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
    context.log(`ai-codex-login-complete fallback failed: ${fallbackMessage}`);
    if (relayErrorMessage) {
      return {
        status: 400,
        body: `Codex relay completion failed: ${relayErrorMessage}\nFallback completion failed: ${fallbackMessage}`,
      };
    }
    return { status: 400, body: fallbackMessage };
  }
}

app.http("ai-codex-login-complete", {
  methods: ["POST"],
  route: "ai/codex-login/complete",
  handler: aiCodexLoginComplete,
});
