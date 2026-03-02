import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { recordBusinessAuditEvent } from "../business/audit.js";
import { generateInvoicePdf, getInvoiceById } from "../business/invoices.js";

function parseId(req: HttpRequest) {
  return decodeURIComponent((req.params["id"] || "").trim().toLowerCase());
}

async function getInvoicePdfMetadata(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const id = parseId(req);
  if (!id) return { status: 400, body: "Missing id" };

  const invoice = await getInvoiceById(id);
  if (!invoice) return { status: 404, body: "Invoice not found" };

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoiceId: invoice.id, pdf: invoice.pdf }),
  };
}

async function postInvoicePdf(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const id = parseId(req);
  if (!id) return { status: 400, body: "Missing id" };

  const before = await getInvoiceById(id);
  if (!before) return { status: 404, body: "Invoice not found" };

  try {
    const after = await generateInvoicePdf(id);

    await recordBusinessAuditEvent(req, {
      source: "ui",
      actionType: "business.invoice.pdf.generate",
      entityRef: { type: "invoice", id },
      before,
      after,
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: after.id, pdf: after.pdf }),
    };
  } catch (error) {
    return { status: 500, body: error instanceof Error ? error.message : "Failed to generate invoice PDF" };
  }
}

app.http("business-invoice-pdf-get", {
  methods: ["GET"],
  route: "business/invoices/{id}/pdf",
  handler: getInvoicePdfMetadata,
});

app.http("business-invoice-pdf-post", {
  methods: ["POST"],
  route: "business/invoices/{id}/pdf",
  handler: postInvoicePdf,
});
