import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { recordBusinessAuditEvent } from "../business/audit.js";
import { runReconciliation } from "../business/reconcile.js";

async function runBusinessReconciliation(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const payload = await req.json();

  try {
    const result = await runReconciliation(payload);

    await recordBusinessAuditEvent(req, {
      source: "ui",
      actionType: "business.reconcile.run",
      entityRef: { type: "reconcile-run", id: result.id },
      after: result,
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (error) {
    return { status: 400, body: error instanceof Error ? error.message : "Failed to run reconciliation" };
  }
}

app.http("business-reconcile-run", {
  methods: ["POST"],
  route: "business/reconcile/run",
  handler: runBusinessReconciliation,
});
