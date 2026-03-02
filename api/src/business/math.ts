import { invoiceLineSchema, invoiceTotalsSchema, type BusinessInvoice, type InvoiceLine, type InvoiceTotals } from "./schemas.js";
import { makeEntityId } from "./utils.js";

function roundMinor(value: number) {
  return Math.round(value);
}

export function computeInvoiceLineTotals(input: {
  lineId?: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor?: number;
  taxRateBps?: number;
  accountId: string;
  metadata?: Record<string, string>;
}): InvoiceLine {
  const quantity = Number(input.quantity);
  const unitPriceMinor = Math.trunc(input.unitPriceMinor);
  const discountMinor = Math.max(0, Math.trunc(input.discountMinor || 0));
  const taxRateBps = Math.max(0, Math.trunc(input.taxRateBps || 0));

  const grossSubtotal = roundMinor(quantity * unitPriceMinor);
  const subtotalMinor = grossSubtotal;
  const taxableMinor = Math.max(0, subtotalMinor - discountMinor);
  const taxMinor = roundMinor((taxableMinor * taxRateBps) / 10000);
  const totalMinor = taxableMinor + taxMinor;

  return invoiceLineSchema.parse({
    lineId: input.lineId || makeEntityId("line"),
    description: input.description,
    quantity,
    unitPriceMinor,
    discountMinor,
    taxRateBps,
    accountId: input.accountId,
    metadata: input.metadata,
    subtotalMinor,
    taxMinor,
    totalMinor,
  });
}

export function computeInvoiceTotals(lines: InvoiceLine[], existing?: Partial<InvoiceTotals>): InvoiceTotals {
  const subtotalMinor = lines.reduce((sum, line) => sum + line.subtotalMinor, 0);
  const discountTotalMinor = lines.reduce((sum, line) => sum + line.discountMinor, 0);
  const taxTotalMinor = lines.reduce((sum, line) => sum + line.taxMinor, 0);
  const totalMinor = subtotalMinor - discountTotalMinor + taxTotalMinor;

  const amountPaidMinor = Math.max(0, Math.trunc(existing?.amountPaidMinor || 0));
  const amountRefundedMinor = Math.max(0, Math.trunc(existing?.amountRefundedMinor || 0));
  const amountWrittenOffMinor = Math.max(0, Math.trunc(existing?.amountWrittenOffMinor || 0));
  const amountDueMinor = Math.max(0, totalMinor - amountPaidMinor - amountWrittenOffMinor);

  return invoiceTotalsSchema.parse({
    subtotalMinor,
    taxTotalMinor,
    discountTotalMinor,
    totalMinor,
    amountPaidMinor,
    amountRefundedMinor,
    amountWrittenOffMinor,
    amountDueMinor,
  });
}

export function applyPaymentToTotals(
  totals: InvoiceTotals,
  payment: {
    type: "payment" | "refund" | "writeoff";
    amountMinor: number;
  },
): InvoiceTotals {
  const amountMinor = Math.max(0, Math.trunc(payment.amountMinor));

  const next: InvoiceTotals = {
    ...totals,
    amountPaidMinor: totals.amountPaidMinor,
    amountRefundedMinor: totals.amountRefundedMinor,
    amountWrittenOffMinor: totals.amountWrittenOffMinor,
    amountDueMinor: totals.amountDueMinor,
  };

  if (payment.type === "payment") {
    next.amountPaidMinor += amountMinor;
  }
  if (payment.type === "refund") {
    next.amountPaidMinor = Math.max(0, next.amountPaidMinor - amountMinor);
    next.amountRefundedMinor += amountMinor;
  }
  if (payment.type === "writeoff") {
    next.amountWrittenOffMinor += amountMinor;
  }

  next.amountDueMinor = Math.max(0, next.totalMinor - next.amountPaidMinor - next.amountWrittenOffMinor);
  return invoiceTotalsSchema.parse(next);
}

export function deriveInvoiceStatus(currentStatus: BusinessInvoice["status"], totals: InvoiceTotals): BusinessInvoice["status"] {
  if (currentStatus === "void") return "void";
  if (totals.amountDueMinor <= 0) return "paid";
  if (totals.amountPaidMinor > 0 || totals.amountWrittenOffMinor > 0) return "partially_paid";
  if (currentStatus === "draft") return "draft";
  return "sent";
}

export function invoiceIsOverdue(invoice: BusinessInvoice, today: string) {
  if (invoice.status === "void" || invoice.status === "paid") return false;
  return invoice.dueDate < today && invoice.totals.amountDueMinor > 0;
}
