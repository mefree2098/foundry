import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { uploadBlobData } from "../storage.js";
import { getBusinessConfig, reserveNextInvoiceNumber } from "./config.js";
import { computeInvoiceLineTotals, computeInvoiceTotals, deriveInvoiceStatus } from "./math.js";
import { createJournalEntry, createReversalEntry, getJournalEntryById } from "./ledger.js";
import { renderInvoicePdf } from "./pdf.js";
import {
  businessCustomerSchema,
  businessInvoiceInputSchema,
  businessInvoiceSchema,
  type BusinessCustomer,
  type BusinessInvoice,
  type InvoiceLine,
} from "./schemas.js";
import { addDays, ensureIsoDate, makeEntityId, nowIso, todayIsoDate } from "./utils.js";

type ListInvoicesOptions = {
  status?: BusinessInvoice["status"];
  customerId?: string;
  limit: number;
  cursor?: string;
};

type SendInvoiceOptions = {
  recipients?: string[];
  idempotencyKey?: string;
};

async function findCustomer(customerId: string): Promise<BusinessCustomer | null> {
  const container = database.container(containers.businessCustomers);
  const { resources } = await container.items
    .query({
      query: "SELECT TOP 1 * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: customerId }],
    })
    .fetchAll();

  if (!resources[0]) return null;
  const parsed = businessCustomerSchema.safeParse(resources[0]);
  return parsed.success ? parsed.data : null;
}

export async function getInvoiceById(id: string): Promise<BusinessInvoice | null> {
  const container = database.container(containers.businessInvoices);
  const { resources } = await container.items
    .query({
      query: "SELECT TOP 1 * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: id }],
    })
    .fetchAll();

  if (!resources[0]) return null;
  const parsed = businessInvoiceSchema.safeParse(resources[0]);
  return parsed.success ? parsed.data : null;
}

export async function listInvoices(options: ListInvoicesOptions): Promise<{ items: BusinessInvoice[]; cursor?: string }> {
  const limit = Math.min(Math.max(options.limit, 1), 200);
  const filters: string[] = [];
  const parameters: Array<{ name: string; value: string }> = [];

  if (options.status) {
    filters.push("c.status = @status");
    parameters.push({ name: "@status", value: options.status });
  }
  if (options.customerId) {
    filters.push("c.customerId = @customerId");
    parameters.push({ name: "@customerId", value: options.customerId });
  }
  if (options.cursor) {
    filters.push("c.updatedAt < @cursor");
    parameters.push({ name: "@cursor", value: options.cursor });
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const query = `SELECT TOP ${limit} * FROM c ${where} ORDER BY c.updatedAt DESC`;

  const container = database.container(containers.businessInvoices);
  const { resources } = await container.items.query({ query, parameters }).fetchAll();
  const items = resources.map((resource) => businessInvoiceSchema.safeParse(resource)).filter((parsed) => parsed.success).map((parsed) => parsed.data);

  return {
    items,
    cursor: items.length ? items[items.length - 1].updatedAt : undefined,
  };
}

function buildInvoiceLines(
  inputLines: Array<{
    lineId?: string;
    description: string;
    quantity: number;
    unitPriceMinor: number;
    discountMinor?: number;
    taxRateBps?: number;
    accountId?: string;
    metadata?: Record<string, string>;
  }>,
  defaultAccountId: string,
): InvoiceLine[] {
  return inputLines.map((line) =>
    computeInvoiceLineTotals({
      lineId: line.lineId,
      description: line.description,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      discountMinor: line.discountMinor,
      taxRateBps: line.taxRateBps,
      accountId: line.accountId || defaultAccountId,
      metadata: line.metadata,
    }),
  );
}

export async function upsertInvoiceDraft(payload: unknown): Promise<BusinessInvoice> {
  const parsedInput = businessInvoiceInputSchema.parse(payload);
  const config = await getBusinessConfig();

  const id = (parsedInput.id || makeEntityId("inv")).toLowerCase();
  const existing = await getInvoiceById(id);
  if (existing && existing.status !== "draft") {
    throw new Error("Only draft invoices can be edited directly");
  }

  const customer = await findCustomer(parsedInput.customerId);
  if (!customer) {
    throw new Error(`Customer ${parsedInput.customerId} not found`);
  }

  const issueDate = ensureIsoDate(parsedInput.issueDate, existing?.issueDate || todayIsoDate());
  const defaultDue = addDays(issueDate, customer.defaultTermsDays ?? 30);
  const dueDate = ensureIsoDate(parsedInput.dueDate, existing?.dueDate || defaultDue);
  const currency = parsedInput.currency || existing?.currency || customer.preferredCurrency || config.baseCurrency;
  const lines = buildInvoiceLines(parsedInput.lines, config.systemAccountMap.revenue);
  const totals = computeInvoiceTotals(lines, existing?.totals);

  const invoice = businessInvoiceSchema.parse({
    ...existing,
    id,
    pk: id,
    customerId: parsedInput.customerId,
    issueDate,
    dueDate,
    status: "draft",
    currency,
    lines,
    totals,
    notes: parsedInput.notes || existing?.notes,
    invoiceNumber: existing?.invoiceNumber || parsedInput.invoiceNumber,
    sequenceId: existing?.sequenceId,
    pdf: existing?.pdf || {},
    sent: existing?.sent || { sentTo: [], deliveryLog: [] },
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    lastJournalEntryId: existing?.lastJournalEntryId,
  });

  const container = database.container(containers.businessInvoices);
  await container.items.upsert(invoice);
  return invoice;
}

export async function issueInvoice(id: string): Promise<BusinessInvoice> {
  const existing = await getInvoiceById(id);
  if (!existing) throw new Error("Invoice not found");
  if (existing.status !== "draft") return existing;

  let invoiceNumber = existing.invoiceNumber;
  let sequenceId = existing.sequenceId;

  if (!invoiceNumber || !sequenceId) {
    const reserved = await reserveNextInvoiceNumber();
    invoiceNumber = reserved.invoiceNumber;
    sequenceId = reserved.sequenceId;
  }

  const config = await getBusinessConfig();

  const revenueByAccount = new Map<string, number>();
  for (const line of existing.lines) {
    const revenue = Math.max(0, line.subtotalMinor - line.discountMinor);
    const current = revenueByAccount.get(line.accountId) || 0;
    revenueByAccount.set(line.accountId, current + revenue);
  }

  const journalLines = [
    {
      accountId: config.systemAccountMap.accountsReceivable,
      debitMinor: existing.totals.totalMinor,
      creditMinor: 0,
      currency: existing.currency,
      dimensions: { customerId: existing.customerId, invoiceId: existing.id },
    },
    ...Array.from(revenueByAccount.entries()).map(([accountId, amount]) => ({
      accountId,
      debitMinor: 0,
      creditMinor: amount,
      currency: existing.currency,
      dimensions: { customerId: existing.customerId, invoiceId: existing.id },
    })),
  ];

  if (existing.totals.taxTotalMinor > 0) {
    journalLines.push({
      accountId: config.systemAccountMap.salesTaxPayable,
      debitMinor: 0,
      creditMinor: existing.totals.taxTotalMinor,
      currency: existing.currency,
      dimensions: { customerId: existing.customerId, invoiceId: existing.id },
    });
  }

  const journalEntry = await createJournalEntry({
    postedDate: existing.issueDate,
    memo: `Issue invoice ${invoiceNumber}`,
    source: "invoice",
    sourceRefId: existing.id,
    lines: journalLines,
  });

  const next = businessInvoiceSchema.parse({
    ...existing,
    status: deriveInvoiceStatus("sent", existing.totals),
    invoiceNumber,
    sequenceId,
    updatedAt: nowIso(),
    lastJournalEntryId: journalEntry.id,
  });

  const container = database.container(containers.businessInvoices);
  await container.items.upsert(next);
  return next;
}

export async function voidInvoice(id: string): Promise<BusinessInvoice> {
  const existing = await getInvoiceById(id);
  if (!existing) throw new Error("Invoice not found");
  if (existing.status === "void") return existing;
  if (existing.totals.amountPaidMinor > 0 || existing.totals.amountWrittenOffMinor > 0) {
    throw new Error("Cannot void invoice with applied payments or write-offs");
  }

  if (existing.lastJournalEntryId) {
    const originalJournal = await getJournalEntryById(existing.lastJournalEntryId);
    if (originalJournal && !originalJournal.reversedBy) {
      await createReversalEntry(originalJournal, {
        postedDate: todayIsoDate(),
        memo: `Void invoice ${existing.invoiceNumber || existing.id}`,
      });
    }
  }

  const nextTotals = {
    ...existing.totals,
    amountDueMinor: 0,
  };

  const next = businessInvoiceSchema.parse({
    ...existing,
    status: "void",
    totals: nextTotals,
    updatedAt: nowIso(),
  });

  const container = database.container(containers.businessInvoices);
  await container.items.upsert(next);
  return next;
}

export async function generateInvoicePdf(id: string): Promise<BusinessInvoice> {
  const invoice = await getInvoiceById(id);
  if (!invoice) throw new Error("Invoice not found");

  const customer = await findCustomer(invoice.customerId);
  const { buffer, contentHash } = renderInvoicePdf(invoice, customer?.displayName || invoice.customerId);

  const upload = await uploadBlobData({
    filename: `${invoice.invoiceNumber || invoice.id}.pdf`,
    data: buffer,
    contentType: "application/pdf",
    prefix: "business/invoices",
  });

  const next = businessInvoiceSchema.parse({
    ...invoice,
    pdf: {
      blobUrl: upload.blobUrl,
      generatedAt: nowIso(),
      templateVersion: "v1",
      contentHash,
    },
    updatedAt: nowIso(),
  });

  const container = database.container(containers.businessInvoices);
  await container.items.upsert(next);
  return next;
}

export async function sendInvoice(id: string, options?: SendInvoiceOptions): Promise<BusinessInvoice> {
  const invoice = await getInvoiceById(id);
  if (!invoice) throw new Error("Invoice not found");

  const customer = await findCustomer(invoice.customerId);
  const fallbackRecipients = customer?.emails || [];
  const recipients = (options?.recipients?.filter(Boolean) || fallbackRecipients).map((entry) => entry.toLowerCase());
  if (!recipients.length) {
    throw new Error("No recipient email addresses available");
  }

  const idempotencyKey = options?.idempotencyKey;
  const existingLog = invoice.sent.deliveryLog.find((entry) => idempotencyKey && entry.idempotencyKey === idempotencyKey);
  if (existingLog) return invoice;

  const attemptedAt = nowIso();
  const deliveryLog = [
    ...invoice.sent.deliveryLog,
    ...recipients.map((recipient) => ({
      attemptedAt,
      recipient,
      status: "sent" as const,
      idempotencyKey,
    })),
  ];

  const next = businessInvoiceSchema.parse({
    ...invoice,
    status: invoice.status === "draft" ? "sent" : invoice.status,
    sent: {
      sentAt: attemptedAt,
      sentTo: Array.from(new Set([...(invoice.sent.sentTo || []), ...recipients])),
      deliveryLog,
    },
    updatedAt: nowIso(),
  });

  const container = database.container(containers.businessInvoices);
  await container.items.upsert(next);
  return next;
}
