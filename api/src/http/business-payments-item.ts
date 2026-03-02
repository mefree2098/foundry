import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { recordBusinessAuditEvent } from "../business/audit.js";
import { getPaymentById, reversePayment } from "../business/payments.js";

async function deleteBusinessPayment(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const id = decodeURIComponent((req.params["id"] || "").trim().toLowerCase());
  if (!id) return { status: 400, body: "Missing id" };

  const before = await getPaymentById(id);
  if (!before) return { status: 404, body: "Payment not found" };

  try {
    const { payment, invoice } = await reversePayment(id);

    await recordBusinessAuditEvent(req, {
      source: "ui",
      actionType: "business.payment.reverse",
      entityRef: { type: "payment", id },
      before,
      after: { payment, invoice },
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment, invoice }),
    };
  } catch (error) {
    return { status: 400, body: error instanceof Error ? error.message : "Failed to reverse payment" };
  }
}

app.http("business-payments-item-delete", {
  methods: ["DELETE"],
  route: "business/payments/{id}",
  handler: deleteBusinessPayment,
});
