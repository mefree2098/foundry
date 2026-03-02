import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin, getClientPrincipal } from "../auth.js";
import { executeBusinessAction } from "../business/actions.js";
import { hashActionBatch, verifyConfirmToken } from "../business/assistant.js";
import { recordBusinessAuditEvent } from "../business/audit.js";
import { businessAiActionSchema, businessAiApplyRequestSchema } from "../business/schemas.js";

async function businessAiApply(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const payload = await req.json();
  const parsed = businessAiApplyRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 400, body: JSON.stringify(parsed.error.flatten()) };
  }

  const principal = getClientPrincipal(req);
  const userId = principal?.userId || principal?.userDetails || "admin";
  const actions = parsed.data.actions.map((action) => businessAiActionSchema.parse(action));

  if (parsed.data.mode === "live") {
    const token = parsed.data.confirmToken || actions[0]?.confirmToken;
    if (!token) {
      return { status: 400, body: "Live apply requires confirmToken" };
    }
    const payloadHash = hashActionBatch(userId, actions);
    const valid = verifyConfirmToken(token, userId, payloadHash);
    if (!valid) {
      return { status: 403, body: "Invalid or expired confirmToken" };
    }
  }

  const results: Array<{ actionId: string; type: string; ok: boolean; result?: unknown; error?: string }> = [];

  for (const action of actions) {
    try {
      const mode = parsed.data.mode === "simulation" || action.simulation ? "simulation" : "live";
      const result = await executeBusinessAction(action, mode);
      results.push({ actionId: action.id, type: action.type, ok: true, result });

      await recordBusinessAuditEvent(req, {
        source: "ai",
        actionType: mode === "live" ? `business.ai.apply.${action.type}` : `business.ai.simulate.${action.type}`,
        entityRef: { type: "ai-action", id: action.id },
        after: result,
      });
    } catch (error) {
      results.push({
        actionId: action.id,
        type: action.type,
        ok: false,
        error: error instanceof Error ? error.message : "Action failed",
      });
    }
  }

  const mutatingTypes = new Set([
    "invoice_create_draft",
    "invoice_issue",
    "invoice_send_email",
    "payment_record",
    "payment_refund",
    "payment_writeoff",
    "bank_reconcile_run",
  ]);
  const appliedCount = results.filter((result) => result.ok && parsed.data.mode === "live" && mutatingTypes.has(result.type)).length;

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: parsed.data.mode,
      appliedCount,
      results,
    }),
  };
}

app.http("business-ai-apply", {
  methods: ["POST"],
  route: "business/ai/apply",
  handler: businessAiApply,
});
