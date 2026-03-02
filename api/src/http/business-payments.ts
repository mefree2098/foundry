import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { recordBusinessAuditEvent } from "../business/audit.js";
import { listPayments, postPayment } from "../business/payments.js";

function parseLimit(value: string | null) {
  const parsed = Number(value || "50");
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.trunc(parsed), 1), 200);
}

async function getBusinessPayments(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = url.searchParams.get("cursor") || undefined;
  const invoiceId = url.searchParams.get("invoiceId") || undefined;

  const data = await listPayments({ limit, cursor, invoiceId });
  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

async function postBusinessPayment(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const payload = await req.json();

  try {
    const { payment, invoice } = await postPayment(payload);

    await recordBusinessAuditEvent(req, {
      source: "ui",
      actionType: `business.payment.${payment.type}`,
      entityRef: { type: "payment", id: payment.id },
      after: { payment, invoice },
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment, invoice }),
    };
  } catch (error) {
    return { status: 400, body: error instanceof Error ? error.message : "Failed to post payment" };
  }
}

app.http("business-payments-get", {
  methods: ["GET"],
  route: "business/payments",
  handler: getBusinessPayments,
});

app.http("business-payments-post", {
  methods: ["POST"],
  route: "business/payments",
  handler: postBusinessPayment,
});
