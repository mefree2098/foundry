import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { getReconcileStatus } from "../business/reconcile.js";

async function getBusinessReconcileStatus(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const url = new URL(req.url);
  const bankAccountId = url.searchParams.get("bankAccountId") || undefined;
  const runId = url.searchParams.get("runId") || undefined;

  const status = await getReconcileStatus(bankAccountId, runId);
  if (!status) return { status: 404, body: "No reconcile run found" };

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(status),
  };
}

app.http("business-reconcile-status", {
  methods: ["GET"],
  route: "business/reconcile/status",
  handler: getBusinessReconcileStatus,
});
