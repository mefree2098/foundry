import { app, type InvocationContext, type Timer } from "@azure/functions";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { computeTrialBalance, listAllJournalEntries } from "../business/ledger.js";
import { businessInvoiceSchema } from "../business/schemas.js";

async function runBusinessInvariantChecks(_timer: Timer, context: InvocationContext) {
  const enabled = String(process.env.BUSINESS_INVARIANTS_TIMER_ENABLED || "true").toLowerCase() === "true";
  if (!enabled) {
    context.log("Business invariant timer disabled");
    return;
  }

  try {
    const [entries, invoiceResources] = await Promise.all([
      listAllJournalEntries(),
      database.container(containers.businessInvoices).items.query("SELECT * FROM c").fetchAll(),
    ]);

    const trialBalance = computeTrialBalance(entries);
    if (!trialBalance.balanced) {
      context.error(`Business invariant failure: trial balance delta ${trialBalance.total}`);
    }

    const invoices = invoiceResources.resources.map((resource) => businessInvoiceSchema.safeParse(resource)).filter((parsed) => parsed.success).map((parsed) => parsed.data);
    const orphaned = invoices.filter((invoice) => invoice.status !== "draft" && invoice.status !== "void" && !invoice.lastJournalEntryId);
    if (orphaned.length) {
      context.error(`Business invariant failure: ${orphaned.length} invoices without journal links`);
    }

    context.log(`Business invariants checked. entries=${entries.length}, invoices=${invoices.length}, balanced=${trialBalance.balanced}`);
  } catch (error) {
    context.error("Business invariant timer failed", error);
  }
}

app.timer("business-invariants-nightly", {
  schedule: "0 0 3 * * *",
  handler: runBusinessInvariantChecks,
});
