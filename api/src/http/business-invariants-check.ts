import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { computeTrialBalance, listAllJournalEntries } from "../business/ledger.js";
import { businessInvoiceSchema, bankTransactionSchema } from "../business/schemas.js";

async function checkBusinessInvariants(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const [entries, invoiceResources, txResources] = await Promise.all([
    listAllJournalEntries(),
    database.container(containers.businessInvoices).items.query("SELECT * FROM c").fetchAll(),
    database.container(containers.businessBankTransactions).items.query("SELECT * FROM c").fetchAll(),
  ]);

  const trialBalance = computeTrialBalance(entries);
  const invoices = invoiceResources.resources.map((resource) => businessInvoiceSchema.safeParse(resource)).filter((parsed) => parsed.success).map((parsed) => parsed.data);
  const transactions = txResources.resources.map((resource) => bankTransactionSchema.safeParse(resource)).filter((parsed) => parsed.success).map((parsed) => parsed.data);

  const issues: string[] = [];

  if (!trialBalance.balanced) {
    issues.push(`Trial balance is out of balance by ${trialBalance.total}`);
  }

  for (const invoice of invoices) {
    if (invoice.status !== "draft" && invoice.status !== "void" && !invoice.lastJournalEntryId) {
      issues.push(`Invoice ${invoice.id} is ${invoice.status} but has no journal link`);
    }
  }

  const txIdSet = new Set<string>();
  for (const transaction of transactions) {
    if (txIdSet.has(transaction.id)) {
      issues.push(`Duplicate bank transaction id detected: ${transaction.id}`);
    }
    txIdSet.add(transaction.id);
  }

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok: issues.length === 0,
      checkedAt: new Date().toISOString(),
      trialBalance,
      counts: {
        journalEntries: entries.length,
        invoices: invoices.length,
        bankTransactions: transactions.length,
      },
      issues,
    }),
  };
}

app.http("business-invariants-check", {
  methods: ["GET"],
  route: "business/invariants/check",
  handler: checkBusinessInvariants,
});
