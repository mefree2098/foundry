import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin, getClientPrincipal } from "../auth.js";
import { planBusinessActions } from "../business/assistant.js";
import { businessAiChatRequestSchema } from "../business/schemas.js";

async function businessAiChat(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const payload = await req.json();
  const parsed = businessAiChatRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 400, body: JSON.stringify(parsed.error.flatten()) };
  }

  const principal = getClientPrincipal(req);
  const userId = principal?.userId || principal?.userDetails || "admin";

  const planned = planBusinessActions({
    userId,
    mode: parsed.data.mode,
    messages: parsed.data.messages,
  });

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assistantMessage: planned.assistantMessage,
      mode: planned.mode,
      proposedActions: planned.proposedActions,
      confirmToken: planned.confirmToken,
      payloadHash: planned.payloadHash,
    }),
  };
}

app.http("business-ai-chat", {
  methods: ["POST"],
  route: "business/ai/chat",
  handler: businessAiChat,
});
