import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { z } from "zod";
import { ensureAdmin, getClientPrincipal } from "../auth.js";
import { completeCodexLoginRelay } from "../codex/appServer.js";

const requestSchema = z.object({
  loginId: z.string().min(1),
  callbackUrl: z.string().min(1),
});

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

  try {
    await completeCodexLoginRelay({
      ownerId: principal.userId,
      loginKey: parsed.data.loginId,
      callbackUrlOrQuery: parsed.data.callbackUrl,
      context,
    });
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.log(`ai-codex-login-complete failed: ${message}`);
    return { status: 400, body: message };
  }
}

app.http("ai-codex-login-complete", {
  methods: ["POST"],
  route: "ai/codex-login/complete",
  handler: aiCodexLoginComplete,
});

