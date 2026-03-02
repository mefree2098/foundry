import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { recordBusinessAuditEvent } from "../business/audit.js";
import { getInvoiceById, voidInvoice } from "../business/invoices.js";

function parseInvoiceId(req: HttpRequest) {
  return decodeURIComponent((req.params["id"] || "").trim().toLowerCase());
}

async function getBusinessInvoice(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const id = parseInvoiceId(req);
  if (!id) return { status: 400, body: "Missing id" };

  const invoice = await getInvoiceById(id);
  if (!invoice) return { status: 404, body: "Invoice not found" };

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(invoice),
  };
}

async function deleteBusinessInvoice(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const id = parseInvoiceId(req);
  if (!id) return { status: 400, body: "Missing id" };

  const before = await getInvoiceById(id);
  if (!before) return { status: 404, body: "Invoice not found" };

  try {
    const after = await voidInvoice(id);

    await recordBusinessAuditEvent(req, {
      source: "ui",
      actionType: "business.invoice.void",
      entityRef: { type: "invoice", id },
      before,
      after,
    });

    return { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(after) };
  } catch (error) {
    return { status: 400, body: error instanceof Error ? error.message : "Failed to void invoice" };
  }
}

app.http("business-invoice-item-get", {
  methods: ["GET"],
  route: "business/invoices/{id}",
  handler: getBusinessInvoice,
});

app.http("business-invoice-item-delete", {
  methods: ["DELETE"],
  route: "business/invoices/{id}",
  handler: deleteBusinessInvoice,
});
