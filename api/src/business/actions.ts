import { generateBusinessReport } from "./reports.js";
import { runReconciliation } from "./reconcile.js";
import { issueInvoice, sendInvoice, upsertInvoiceDraft } from "./invoices.js";
import { postPayment } from "./payments.js";
import { businessAiActionSchema, type BusinessAiAction } from "./schemas.js";

const mutatingActionTypes = new Set<BusinessAiAction["type"]>([
  "invoice_create_draft",
  "invoice_issue",
  "invoice_send_email",
  "payment_record",
  "payment_refund",
  "payment_writeoff",
  "bank_reconcile_run",
]);

export function isMutatingAction(action: BusinessAiAction) {
  return mutatingActionTypes.has(action.type);
}

export async function executeBusinessAction(actionInput: unknown, mode: "simulation" | "live") {
  const action = businessAiActionSchema.parse(actionInput);

  if (mode === "simulation" && isMutatingAction(action)) {
    return {
      actionId: action.id,
      type: action.type,
      simulation: true,
      payload: action.payload,
      message: "Validation passed. No state changes were committed.",
    };
  }

  if (action.type === "invoice_create_draft") {
    const invoice = await upsertInvoiceDraft(action.payload);
    return { actionId: action.id, type: action.type, result: invoice };
  }

  if (action.type === "invoice_issue") {
    const invoiceId = typeof action.payload.invoiceId === "string" ? action.payload.invoiceId : "";
    if (!invoiceId) throw new Error("invoice_issue requires payload.invoiceId");
    const invoice = await issueInvoice(invoiceId);
    return { actionId: action.id, type: action.type, result: invoice };
  }

  if (action.type === "invoice_send_email") {
    const invoiceId = typeof action.payload.invoiceId === "string" ? action.payload.invoiceId : "";
    if (!invoiceId) throw new Error("invoice_send_email requires payload.invoiceId");

    const recipients = Array.isArray(action.payload.recipients)
      ? action.payload.recipients.filter((value): value is string => typeof value === "string")
      : undefined;

    const invoice = await sendInvoice(invoiceId, {
      recipients,
      idempotencyKey: action.idempotencyKey,
    });
    return { actionId: action.id, type: action.type, result: invoice };
  }

  if (action.type === "payment_record" || action.type === "payment_refund" || action.type === "payment_writeoff") {
    const type = action.type === "payment_record" ? "payment" : action.type === "payment_refund" ? "refund" : "writeoff";
    const result = await postPayment({
      ...action.payload,
      type,
    });
    return { actionId: action.id, type: action.type, result };
  }

  if (action.type === "bank_reconcile_run") {
    const result = await runReconciliation(action.payload);
    return { actionId: action.id, type: action.type, result };
  }

  if (action.type === "report_generate") {
    const reportType = typeof action.payload.reportType === "string" ? action.payload.reportType : "pnl";
    const result = await generateBusinessReport(reportType, {
      fromDate: typeof action.payload.fromDate === "string" ? action.payload.fromDate : undefined,
      toDate: typeof action.payload.toDate === "string" ? action.payload.toDate : undefined,
      asOfDate: typeof action.payload.asOfDate === "string" ? action.payload.asOfDate : undefined,
    });
    return { actionId: action.id, type: action.type, result };
  }

  throw new Error(`Unsupported action type: ${action.type}`);
}
