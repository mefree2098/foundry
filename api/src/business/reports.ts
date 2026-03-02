import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { getBusinessConfig } from "./config.js";
import { listAllJournalEntries } from "./ledger.js";
import { businessInvoiceSchema, type BusinessInvoice, type JournalEntry } from "./schemas.js";
import { todayIsoDate } from "./utils.js";

type ReportType = "pnl" | "balance-sheet" | "cash-flow" | "ar-aging" | "sales-by-customer" | "trial-balance";

type ReportParams = {
  fromDate?: string;
  toDate?: string;
  asOfDate?: string;
};

async function listAllInvoices(): Promise<BusinessInvoice[]> {
  const container = database.container(containers.businessInvoices);
  const { resources } = await container.items.query("SELECT * FROM c").fetchAll();
  return resources.map((resource) => businessInvoiceSchema.safeParse(resource)).filter((parsed) => parsed.success).map((parsed) => parsed.data);
}

function inDateRange(date: string, fromDate?: string, toDate?: string) {
  if (fromDate && date < fromDate) return false;
  if (toDate && date > toDate) return false;
  return true;
}

function aggregateAccountBalances(entries: JournalEntry[], fromDate?: string, toDate?: string) {
  const balances = new Map<string, number>();
  for (const entry of entries) {
    if (!inDateRange(entry.postedDate, fromDate, toDate)) continue;
    for (const line of entry.lines) {
      const existing = balances.get(line.accountId) || 0;
      balances.set(line.accountId, existing + line.debitMinor - line.creditMinor);
    }
  }
  return balances;
}

export async function generateBusinessReport(reportTypeRaw: string, params: ReportParams) {
  const reportType = (reportTypeRaw || "").toLowerCase() as ReportType;
  const [config, entries, invoices] = await Promise.all([getBusinessConfig(), listAllJournalEntries(), listAllInvoices()]);

  const accountIndex = new Map(config.chartOfAccounts.map((account) => [account.id, account]));
  const fromDate = params.fromDate;
  const toDate = params.toDate || params.asOfDate || todayIsoDate();

  if (reportType === "pnl") {
    const balances = aggregateAccountBalances(entries, fromDate, toDate);
    const income: Array<{ accountId: string; name: string; amountMinor: number }> = [];
    const expenses: Array<{ accountId: string; name: string; amountMinor: number }> = [];

    for (const [accountId, balance] of balances.entries()) {
      const account = accountIndex.get(accountId);
      if (!account) continue;
      if (account.type === "income") {
        income.push({ accountId, name: account.name, amountMinor: -balance });
      }
      if (account.type === "expense") {
        expenses.push({ accountId, name: account.name, amountMinor: balance });
      }
    }

    const totalIncomeMinor = income.reduce((sum, row) => sum + row.amountMinor, 0);
    const totalExpensesMinor = expenses.reduce((sum, row) => sum + row.amountMinor, 0);

    return {
      reportType: "pnl",
      currency: config.baseCurrency,
      fromDate,
      toDate,
      income,
      expenses,
      totals: {
        incomeMinor: totalIncomeMinor,
        expenseMinor: totalExpensesMinor,
        netIncomeMinor: totalIncomeMinor - totalExpensesMinor,
      },
    };
  }

  if (reportType === "balance-sheet") {
    const balances = aggregateAccountBalances(entries, undefined, toDate);
    const assets: Array<{ accountId: string; name: string; amountMinor: number }> = [];
    const liabilities: Array<{ accountId: string; name: string; amountMinor: number }> = [];
    const equity: Array<{ accountId: string; name: string; amountMinor: number }> = [];

    for (const [accountId, balance] of balances.entries()) {
      const account = accountIndex.get(accountId);
      if (!account) continue;
      if (account.type === "asset") assets.push({ accountId, name: account.name, amountMinor: balance });
      if (account.type === "liability") liabilities.push({ accountId, name: account.name, amountMinor: -balance });
      if (account.type === "equity") equity.push({ accountId, name: account.name, amountMinor: -balance });
    }

    const totalAssetsMinor = assets.reduce((sum, row) => sum + row.amountMinor, 0);
    const totalLiabilitiesMinor = liabilities.reduce((sum, row) => sum + row.amountMinor, 0);
    const totalEquityMinor = equity.reduce((sum, row) => sum + row.amountMinor, 0);

    return {
      reportType: "balance-sheet",
      currency: config.baseCurrency,
      asOfDate: toDate,
      assets,
      liabilities,
      equity,
      totals: {
        assetsMinor: totalAssetsMinor,
        liabilitiesMinor: totalLiabilitiesMinor,
        equityMinor: totalEquityMinor,
        equationDeltaMinor: totalAssetsMinor - (totalLiabilitiesMinor + totalEquityMinor),
      },
    };
  }

  if (reportType === "cash-flow") {
    const cashAccountId = config.systemAccountMap.cash;
    const items: Array<{ postedDate: string; memo: string; amountMinor: number; entryId: string }> = [];

    for (const entry of entries) {
      if (!inDateRange(entry.postedDate, fromDate, toDate)) continue;
      const amountMinor = entry.lines
        .filter((line) => line.accountId === cashAccountId)
        .reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0);
      if (amountMinor === 0) continue;
      items.push({ postedDate: entry.postedDate, memo: entry.memo, amountMinor, entryId: entry.id });
    }

    const netCashFlowMinor = items.reduce((sum, item) => sum + item.amountMinor, 0);
    return {
      reportType: "cash-flow",
      currency: config.baseCurrency,
      fromDate,
      toDate,
      items,
      totals: { netCashFlowMinor },
    };
  }

  if (reportType === "ar-aging") {
    const asOfDate = params.asOfDate || todayIsoDate();
    const openInvoices = invoices.filter((invoice) => invoice.status !== "void" && invoice.totals.amountDueMinor > 0);
    const buckets = {
      currentMinor: 0,
      days1To30Minor: 0,
      days31To60Minor: 0,
      days61To90Minor: 0,
      daysOver90Minor: 0,
    };

    const rows = openInvoices.map((invoice) => {
      const dueTime = new Date(`${invoice.dueDate}T00:00:00.000Z`).getTime();
      const asOfTime = new Date(`${asOfDate}T00:00:00.000Z`).getTime();
      const daysPastDue = Math.max(0, Math.floor((asOfTime - dueTime) / (24 * 60 * 60 * 1000)));
      const amountDueMinor = invoice.totals.amountDueMinor;

      if (daysPastDue === 0) buckets.currentMinor += amountDueMinor;
      else if (daysPastDue <= 30) buckets.days1To30Minor += amountDueMinor;
      else if (daysPastDue <= 60) buckets.days31To60Minor += amountDueMinor;
      else if (daysPastDue <= 90) buckets.days61To90Minor += amountDueMinor;
      else buckets.daysOver90Minor += amountDueMinor;

      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        dueDate: invoice.dueDate,
        daysPastDue,
        amountDueMinor,
      };
    });

    return {
      reportType: "ar-aging",
      currency: config.baseCurrency,
      asOfDate,
      buckets,
      rows,
      totals: {
        openArMinor: Object.values(buckets).reduce((sum, value) => sum + value, 0),
      },
    };
  }

  if (reportType === "sales-by-customer") {
    const rowsByCustomer = new Map<string, { customerId: string; invoicedMinor: number; paidMinor: number; dueMinor: number; invoices: number }>();

    for (const invoice of invoices) {
      if (!inDateRange(invoice.issueDate, fromDate, toDate)) continue;
      const current = rowsByCustomer.get(invoice.customerId) || {
        customerId: invoice.customerId,
        invoicedMinor: 0,
        paidMinor: 0,
        dueMinor: 0,
        invoices: 0,
      };
      current.invoicedMinor += invoice.totals.totalMinor;
      current.paidMinor += invoice.totals.amountPaidMinor;
      current.dueMinor += invoice.totals.amountDueMinor;
      current.invoices += 1;
      rowsByCustomer.set(invoice.customerId, current);
    }

    const rows = Array.from(rowsByCustomer.values()).sort((a, b) => b.invoicedMinor - a.invoicedMinor);
    return {
      reportType: "sales-by-customer",
      currency: config.baseCurrency,
      fromDate,
      toDate,
      rows,
      totals: {
        invoicedMinor: rows.reduce((sum, row) => sum + row.invoicedMinor, 0),
        paidMinor: rows.reduce((sum, row) => sum + row.paidMinor, 0),
        dueMinor: rows.reduce((sum, row) => sum + row.dueMinor, 0),
      },
    };
  }

  if (reportType === "trial-balance") {
    const balances = aggregateAccountBalances(entries, undefined, toDate);
    const rows = Array.from(balances.entries()).map(([accountId, balance]) => {
      const account = accountIndex.get(accountId);
      const debitMinor = balance > 0 ? balance : 0;
      const creditMinor = balance < 0 ? Math.abs(balance) : 0;
      return {
        accountId,
        name: account?.name || accountId,
        type: account?.type || "unknown",
        debitMinor,
        creditMinor,
      };
    });

    const totalDebitMinor = rows.reduce((sum, row) => sum + row.debitMinor, 0);
    const totalCreditMinor = rows.reduce((sum, row) => sum + row.creditMinor, 0);

    return {
      reportType: "trial-balance",
      currency: config.baseCurrency,
      asOfDate: toDate,
      rows,
      totals: {
        debitMinor: totalDebitMinor,
        creditMinor: totalCreditMinor,
        deltaMinor: totalDebitMinor - totalCreditMinor,
      },
    };
  }

  throw new Error(`Unsupported report type: ${reportTypeRaw}`);
}
