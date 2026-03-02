import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { getBusinessConfig } from "./config.js";
import { applyPaymentToTotals, deriveInvoiceStatus } from "./math.js";
import { createJournalEntry, createReversalEntry, getJournalEntryById } from "./ledger.js";
import { getInvoiceById } from "./invoices.js";
import { businessInvoiceSchema, businessPaymentInputSchema, businessPaymentSchema, type BusinessInvoice, type BusinessPayment } from "./schemas.js";
import { makeEntityId, nowIso, todayIsoDate } from "./utils.js";

type ListPaymentsOptions = {
  limit: number;
  cursor?: string;
  invoiceId?: string;
};

function reverseInvoiceTotals(invoice: BusinessInvoice, payment: BusinessPayment) {
  const nextTotals = {
    ...invoice.totals,
  };

  if (payment.type === "payment") {
    nextTotals.amountPaidMinor = Math.max(0, nextTotals.amountPaidMinor - payment.amountMinor);
  }
  if (payment.type === "refund") {
    nextTotals.amountPaidMinor += payment.amountMinor;
    nextTotals.amountRefundedMinor = Math.max(0, nextTotals.amountRefundedMinor - payment.amountMinor);
  }
  if (payment.type === "writeoff") {
    nextTotals.amountWrittenOffMinor = Math.max(0, nextTotals.amountWrittenOffMinor - payment.amountMinor);
  }

  nextTotals.amountDueMinor = Math.max(0, nextTotals.totalMinor - nextTotals.amountPaidMinor - nextTotals.amountWrittenOffMinor);
  return nextTotals;
}

export async function getPaymentById(id: string): Promise<BusinessPayment | null> {
  const container = database.container(containers.businessPayments);
  const { resources } = await container.items
    .query({
      query: "SELECT TOP 1 * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: id }],
    })
    .fetchAll();

  if (!resources[0]) return null;
  const parsed = businessPaymentSchema.safeParse(resources[0]);
  return parsed.success ? parsed.data : null;
}

export async function listPayments(options: ListPaymentsOptions): Promise<{ items: BusinessPayment[]; cursor?: string }> {
  const limit = Math.min(Math.max(options.limit, 1), 200);
  const filters: string[] = [];
  const parameters: Array<{ name: string; value: string }> = [];

  if (options.invoiceId) {
    filters.push("c.invoiceId = @invoiceId");
    parameters.push({ name: "@invoiceId", value: options.invoiceId });
  }
  if (options.cursor) {
    filters.push("c.updatedAt < @cursor");
    parameters.push({ name: "@cursor", value: options.cursor });
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const query = `SELECT TOP ${limit} * FROM c ${where} ORDER BY c.updatedAt DESC`;

  const container = database.container(containers.businessPayments);
  const { resources } = await container.items.query({ query, parameters }).fetchAll();
  const items = resources.map((resource) => businessPaymentSchema.safeParse(resource)).filter((parsed) => parsed.success).map((parsed) => parsed.data);

  return {
    items,
    cursor: items.length ? items[items.length - 1].updatedAt : undefined,
  };
}

export async function postPayment(payload: unknown): Promise<{ payment: BusinessPayment; invoice?: BusinessInvoice }> {
  const parsedInput = businessPaymentInputSchema.parse(payload);
  const config = await getBusinessConfig();

  const id = (parsedInput.id || makeEntityId("pay")).toLowerCase();
  const postedDate = parsedInput.postedDate || todayIsoDate();
  const method = parsedInput.method || "other";

  let invoice: BusinessInvoice | null = null;
  if (parsedInput.invoiceId) {
    invoice = await getInvoiceById(parsedInput.invoiceId);
    if (!invoice) throw new Error(`Invoice ${parsedInput.invoiceId} not found`);
    if (invoice.status === "void") throw new Error("Cannot post payments against a void invoice");
  }

  const currency = parsedInput.currency || invoice?.currency || config.baseCurrency;
  const customerId = parsedInput.customerId || invoice?.customerId;
  const amountMinor = parsedInput.amountMinor;

  let debitAccountId = config.systemAccountMap.cash;
  let creditAccountId = config.systemAccountMap.accountsReceivable;
  let memo = "Record payment";

  if (parsedInput.type === "refund") {
    debitAccountId = config.systemAccountMap.refunds;
    creditAccountId = config.systemAccountMap.cash;
    memo = "Record refund";
  }
  if (parsedInput.type === "writeoff") {
    debitAccountId = config.systemAccountMap.badDebtExpense;
    creditAccountId = config.systemAccountMap.accountsReceivable;
    memo = "Record write-off";
  }

  const journalEntry = await createJournalEntry({
    postedDate,
    memo,
    source: "payment",
    sourceRefId: id,
    lines: [
      {
        accountId: debitAccountId,
        debitMinor: amountMinor,
        creditMinor: 0,
        currency,
        dimensions: { customerId, invoiceId: invoice?.id },
      },
      {
        accountId: creditAccountId,
        debitMinor: 0,
        creditMinor: amountMinor,
        currency,
        dimensions: { customerId, invoiceId: invoice?.id },
      },
    ],
  });

  const payment = businessPaymentSchema.parse({
    id,
    pk: id,
    invoiceId: invoice?.id,
    customerId,
    amountMinor,
    currency,
    postedDate,
    method,
    reference: parsedInput.reference,
    type: parsedInput.type,
    bankAccountId: parsedInput.bankAccountId,
    status: "posted",
    journalEntryId: journalEntry.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  const paymentContainer = database.container(containers.businessPayments);
  await paymentContainer.items.upsert(payment);

  let updatedInvoice: BusinessInvoice | undefined;
  if (invoice) {
    const nextTotals = applyPaymentToTotals(invoice.totals, {
      type: payment.type,
      amountMinor: payment.amountMinor,
    });

    updatedInvoice = businessInvoiceSchema.parse({
      ...invoice,
      totals: nextTotals,
      status: deriveInvoiceStatus(invoice.status, nextTotals),
      updatedAt: nowIso(),
    });

    const invoiceContainer = database.container(containers.businessInvoices);
    await invoiceContainer.items.upsert(updatedInvoice);
  }

  return { payment, invoice: updatedInvoice };
}

export async function reversePayment(id: string): Promise<{ payment: BusinessPayment; invoice?: BusinessInvoice }> {
  const payment = await getPaymentById(id);
  if (!payment) throw new Error("Payment not found");
  if (payment.status === "reversed") return { payment };

  const originalEntry = await getJournalEntryById(payment.journalEntryId);
  if (!originalEntry) throw new Error("Original journal entry not found");

  const reversal = await createReversalEntry(originalEntry, {
    postedDate: todayIsoDate(),
    memo: `Reverse payment ${payment.id}`,
  });

  const nextPayment = businessPaymentSchema.parse({
    ...payment,
    status: "reversed",
    reversalJournalEntryId: reversal.id,
    updatedAt: nowIso(),
  });

  const paymentContainer = database.container(containers.businessPayments);
  await paymentContainer.items.upsert(nextPayment);

  let updatedInvoice: BusinessInvoice | undefined;
  if (payment.invoiceId) {
    const invoice = await getInvoiceById(payment.invoiceId);
    if (invoice) {
      const nextTotals = reverseInvoiceTotals(invoice, payment);
      updatedInvoice = businessInvoiceSchema.parse({
        ...invoice,
        totals: nextTotals,
        status: deriveInvoiceStatus(invoice.status, nextTotals),
        updatedAt: nowIso(),
      });

      const invoiceContainer = database.container(containers.businessInvoices);
      await invoiceContainer.items.upsert(updatedInvoice);
    }
  }

  return { payment: nextPayment, invoice: updatedInvoice };
}
