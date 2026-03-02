import { businessConfigSchema, type BusinessAccount, type BusinessConfig, type BusinessInvoice, type InvoiceTotals } from "./schemas.js";

function nowIso() {
  return new Date().toISOString();
}

export const defaultChartOfAccounts: BusinessAccount[] = [
  {
    id: "cash",
    pk: "coa",
    name: "Cash",
    type: "asset",
    subtype: "cash",
    normalBalance: "debit",
    isSystem: true,
    isArchived: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "accounts-receivable",
    pk: "coa",
    name: "Accounts Receivable",
    type: "asset",
    subtype: "ar",
    normalBalance: "debit",
    isSystem: true,
    isArchived: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "undeposited-funds",
    pk: "coa",
    name: "Undeposited Funds",
    type: "asset",
    subtype: "clearing",
    normalBalance: "debit",
    isSystem: true,
    isArchived: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "sales-revenue",
    pk: "coa",
    name: "Sales Revenue",
    type: "income",
    subtype: "revenue",
    normalBalance: "credit",
    isSystem: true,
    isArchived: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "sales-tax-payable",
    pk: "coa",
    name: "Sales Tax Payable",
    type: "liability",
    subtype: "tax-payable",
    normalBalance: "credit",
    isSystem: true,
    isArchived: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "bad-debt-expense",
    pk: "coa",
    name: "Bad Debt Expense",
    type: "expense",
    subtype: "bad-debt",
    normalBalance: "debit",
    isSystem: true,
    isArchived: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "refunds-and-chargebacks",
    pk: "coa",
    name: "Refunds and Chargebacks",
    type: "expense",
    subtype: "refunds",
    normalBalance: "debit",
    isSystem: true,
    isArchived: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "bank-fees",
    pk: "coa",
    name: "Bank Fees",
    type: "expense",
    subtype: "fees",
    normalBalance: "debit",
    isSystem: true,
    isArchived: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "owner-draw",
    pk: "coa",
    name: "Owner Draw",
    type: "equity",
    subtype: "draw",
    normalBalance: "debit",
    isSystem: true,
    isArchived: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "owners-equity",
    pk: "coa",
    name: "Owner's Equity",
    type: "equity",
    subtype: "capital",
    normalBalance: "credit",
    isSystem: true,
    isArchived: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
];

export function createDefaultBusinessConfig(): BusinessConfig {
  const now = nowIso();
  return businessConfigSchema.parse({
    id: "global",
    pk: "global",
    baseCurrency: "USD",
    invoiceNumbering: {
      prefix: "INV-",
      nextSequence: 1,
      padLength: 5,
    },
    chartOfAccounts: defaultChartOfAccounts,
    systemAccountMap: {
      accountsReceivable: "accounts-receivable",
      cash: "cash",
      undepositedFunds: "undeposited-funds",
      revenue: "sales-revenue",
      salesTaxPayable: "sales-tax-payable",
      badDebtExpense: "bad-debt-expense",
      refunds: "refunds-and-chargebacks",
      bankFees: "bank-fees",
      ownerDraw: "owner-draw",
    },
    safeMode: true,
    simulationDefault: true,
    createdAt: now,
    updatedAt: now,
  });
}

export function createEmptyInvoiceTotals(): InvoiceTotals {
  return {
    subtotalMinor: 0,
    taxTotalMinor: 0,
    discountTotalMinor: 0,
    totalMinor: 0,
    amountPaidMinor: 0,
    amountRefundedMinor: 0,
    amountWrittenOffMinor: 0,
    amountDueMinor: 0,
  };
}

export function invoiceDisplayStatus(invoice: BusinessInvoice): string {
  if (invoice.status === "void") return "Void";
  if (invoice.status === "paid") return "Paid";
  if (invoice.status === "partially_paid") return "Partially Paid";
  if (invoice.status === "sent") return "Sent";
  return "Draft";
}
