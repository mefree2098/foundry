import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { recordBusinessAuditEvent } from "../business/audit.js";
import { getInvoiceById, listInvoices, upsertInvoiceDraft } from "../business/invoices.js";

function parseLimit(value: string | null) {
  const parsed = Number(value || "50");
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.trunc(parsed), 1), 200);
}

async function getBusinessInvoices(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const customerId = url.searchParams.get("customerId") || undefined;
  const cursor = url.searchParams.get("cursor") || undefined;
  const limit = parseLimit(url.searchParams.get("limit"));

  const data = await listInvoices({
    status: status as "draft" | "sent" | "partially_paid" | "paid" | "void" | undefined,
    customerId,
    cursor,
    limit,
  });

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

async function upsertBusinessInvoice(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const payload = await req.json();
  const id = typeof (payload as { id?: unknown })?.id === "string" ? String((payload as { id?: string }).id).toLowerCase() : undefined;
  const before = id ? await getInvoiceById(id) : undefined;

  try {
    const invoice = await upsertInvoiceDraft(payload);

    await recordBusinessAuditEvent(req, {
      source: "ui",
      actionType: "business.invoice.upsert",
      entityRef: { type: "invoice", id: invoice.id },
      before,
      after: invoice,
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invoice),
    };
  } catch (error) {
    return { status: 400, body: error instanceof Error ? error.message : "Failed to upsert invoice" };
  }
}

app.http("business-invoices-get", {
  methods: ["GET"],
  route: "business/invoices",
  handler: getBusinessInvoices,
});

app.http("business-invoices-upsert", {
  methods: ["POST", "PUT"],
  route: "business/invoices/{id?}",
  handler: upsertBusinessInvoice,
});
