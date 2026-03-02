import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { recordBusinessAuditEvent } from "../business/audit.js";
import { getInvoiceById, issueInvoice } from "../business/invoices.js";

async function issueBusinessInvoice(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const id = decodeURIComponent((req.params["id"] || "").trim().toLowerCase());
  if (!id) return { status: 400, body: "Missing id" };

  const before = await getInvoiceById(id);
  if (!before) return { status: 404, body: "Invoice not found" };

  try {
    const after = await issueInvoice(id);
    await recordBusinessAuditEvent(req, {
      source: "ui",
      actionType: "business.invoice.issue",
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
    return {
      status: 400,
      body: error instanceof Error ? error.message : "Failed to issue invoice",
    };
  }
}

app.http("business-invoice-issue", {
  methods: ["POST"],
  route: "business/invoices/{id}/issue",
  handler: issueBusinessInvoice,
});
