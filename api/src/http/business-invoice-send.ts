import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { recordBusinessAuditEvent } from "../business/audit.js";
import { getInvoiceById, sendInvoice } from "../business/invoices.js";

async function sendBusinessInvoice(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const id = decodeURIComponent((req.params["id"] || "").trim().toLowerCase());
  if (!id) return { status: 400, body: "Missing id" };

  const before = await getInvoiceById(id);
  if (!before) return { status: 404, body: "Invoice not found" };

  const payload = (await req.json().catch(() => ({}))) as { recipients?: string[]; idempotencyKey?: string };

  try {
    const after = await sendInvoice(id, payload);

    await recordBusinessAuditEvent(req, {
      source: "ui",
      actionType: "business.invoice.send",
      entityRef: { type: "invoice", id },
      before,
      after,
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(after),
    };
  } catch (error) {
    return { status: 400, body: error instanceof Error ? error.message : "Failed to send invoice" };
  }
}

app.http("business-invoice-send", {
  methods: ["POST"],
  route: "business/invoices/{id}/send",
  handler: sendBusinessInvoice,
});
