import { z } from "zod";

export const businessAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["asset", "liability", "equity", "income", "expense"]),
  subtype: z.string().optional(),
  normalBalance: z.enum(["debit", "credit"]),
  isSystem: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const businessConfigSchema = z.object({
  id: z.string().default("global"),
  baseCurrency: z.string().length(3).default("USD"),
  invoiceNumbering: z.object({
    prefix: z.string(),
    nextSequence: z.number().int(),
    padLength: z.number().int(),
  }),
  chartOfAccounts: z.array(businessAccountSchema).default([]),
  systemAccountMap: z.object({
    accountsReceivable: z.string(),
    cash: z.string(),
    undepositedFunds: z.string(),
    revenue: z.string(),
    salesTaxPayable: z.string(),
    badDebtExpense: z.string(),
    refunds: z.string(),
    bankFees: z.string(),
    ownerDraw: z.string(),
  }),
  promptSetId: z.string().optional(),
  activePromptVersion: z.string().optional(),
  safeMode: z.boolean().optional(),
  simulationDefault: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  updatedBy: z.string().optional(),
});

export const businessCustomerSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  displayName: z.string().min(1),
  legalName: z.string().optional(),
  emails: z.array(z.string().email()).default([]),
  billingAddress: z.string().optional(),
  shippingAddress: z.string().optional(),
  taxId: z.string().optional(),
  taxExempt: z.boolean().optional(),
  defaultTermsDays: z.number().int().min(0).max(365).default(30),
  preferredCurrency: z.string().length(3).default("USD"),
  notes: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const businessVendorSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  displayName: z.string().min(1),
  legalName: z.string().optional(),
  emails: z.array(z.string().email()).default([]),
  billingAddress: z.string().optional(),
  taxId: z.string().optional(),
  paymentDetails: z.string().optional(),
  w9Status: z.enum(["unknown", "requested", "received"]),
  preferredCurrency: z.string().length(3).default("USD"),
  notes: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const invoiceLineSchema = z.object({
  lineId: z.string(),
  description: z.string(),
  quantity: z.number(),
  unitPriceMinor: z.number().int(),
  discountMinor: z.number().int(),
  taxRateBps: z.number().int(),
  accountId: z.string(),
  subtotalMinor: z.number().int(),
  taxMinor: z.number().int(),
  totalMinor: z.number().int(),
});

export const invoiceTotalsSchema = z.object({
  subtotalMinor: z.number().int(),
  taxTotalMinor: z.number().int(),
  discountTotalMinor: z.number().int(),
  totalMinor: z.number().int(),
  amountPaidMinor: z.number().int(),
  amountRefundedMinor: z.number().int(),
  amountWrittenOffMinor: z.number().int(),
  amountDueMinor: z.number().int(),
});

export const businessInvoiceSchema = z.object({
  id: z.string(),
  invoiceNumber: z.string().optional(),
  sequenceId: z.number().int().optional(),
  customerId: z.string(),
  issueDate: z.string(),
  dueDate: z.string(),
  status: z.enum(["draft", "sent", "partially_paid", "paid", "void"]),
  currency: z.string(),
  lines: z.array(invoiceLineSchema),
  totals: invoiceTotalsSchema,
  notes: z.string().optional(),
  pdf: z
    .object({
      blobUrl: z.string().optional(),
      generatedAt: z.string().optional(),
      templateVersion: z.string().optional(),
      contentHash: z.string().optional(),
    })
    .default({}),
  sent: z
    .object({
      sentAt: z.string().optional(),
      sentTo: z.array(z.string().email()).default([]),
      deliveryLog: z
        .array(
          z.object({
            attemptedAt: z.string(),
            recipient: z.string().email(),
            status: z.enum(["sent", "failed"]),
            error: z.string().optional(),
            idempotencyKey: z.string().optional(),
          }),
        )
        .default([]),
    })
    .default({ sentTo: [], deliveryLog: [] }),
  lastJournalEntryId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const businessPaymentSchema = z.object({
  id: z.string(),
  invoiceId: z.string().optional(),
  customerId: z.string().optional(),
  amountMinor: z.number().int(),
  currency: z.string(),
  postedDate: z.string(),
  method: z.enum(["cash", "ach", "card", "check", "other"]),
  reference: z.string().optional(),
  type: z.enum(["payment", "refund", "writeoff"]),
  bankAccountId: z.string().optional(),
  status: z.enum(["posted", "reversed"]),
  journalEntryId: z.string(),
  reversalJournalEntryId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const businessJournalLineSchema = z.object({
  accountId: z.string(),
  debitMinor: z.number().int(),
  creditMinor: z.number().int(),
  currency: z.string(),
});

export const businessJournalEntrySchema = z.object({
  id: z.string(),
  postedDate: z.string(),
  memo: z.string(),
  source: z.string(),
  sourceRefId: z.string().optional(),
  lines: z.array(businessJournalLineSchema),
  hash: z.string(),
  prevHash: z.string().optional(),
  reversalOf: z.string().optional(),
  reversedBy: z.string().optional(),
  createdAt: z.string(),
});

export const businessBankAccountSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  institution: z.string().optional(),
  mask: z.string().optional(),
  currency: z.string(),
  feedType: z.enum(["plaid", "ofx", "manual"]),
  connectionState: z.enum(["connected", "needs_reauth", "disabled"]),
  ledgerCashAccountId: z.string(),
  lastSyncAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const businessBankTransactionSchema = z.object({
  id: z.string(),
  bankAccountId: z.string(),
  postedDate: z.string(),
  authorizedDate: z.string().optional(),
  description: z.string(),
  merchant: z.string().optional(),
  categoryHint: z.string().optional(),
  amountMinor: z.number().int(),
  currency: z.string(),
  match: z
    .object({
      journalEntryIds: z.array(z.string()),
      confidence: z.number().optional(),
    })
    .optional(),
  status: z.enum(["unreviewed", "categorized", "reconciled", "ignored"]),
  sourceRef: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const businessImportSourceSchema = z.object({
  id: z.string(),
  type: z.enum(["steam", "apple", "googleplay", "distrokid", "bank-csv", "bank-ofx", "manual"]),
  config: z.record(z.string(), z.unknown()),
  schedule: z.string().optional(),
  state: z.enum(["active", "disabled"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastRunAt: z.string().optional(),
});

export const businessImportJobSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  status: z.enum(["queued", "running", "completed", "failed"]),
  artifactRefs: z.array(z.string()),
  idempotencyKey: z.string().optional(),
  stats: z.object({
    rowsRead: z.number().int(),
    rowsImported: z.number().int(),
    rowsSkipped: z.number().int(),
  }),
  errors: z.array(z.string()),
  resultingJournalEntryIds: z.array(z.string()),
});

export const businessReconcileRunSchema = z.object({
  id: z.string(),
  bankAccountId: z.string(),
  throughDate: z.string(),
  status: z.enum(["running", "completed", "failed"]),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  summary: z.object({
    reviewed: z.number().int(),
    reconciled: z.number().int(),
    unmatched: z.number().int(),
  }),
  suggestions: z.array(
    z.object({
      bankTransactionId: z.string(),
      journalEntryId: z.string().optional(),
      invoiceId: z.string().optional(),
      confidence: z.number(),
      reason: z.string(),
    }),
  ),
});

export const businessAuditActorSchema = z.object({
  userId: z.string().optional(),
  userDetails: z.string().optional(),
  roles: z.array(z.string()).default([]),
});

export const businessAuditEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  actionType: z.string(),
  entityRef: z.object({ type: z.string(), id: z.string() }),
  source: z.enum(["ui", "ai", "import", "system"]).default("ui"),
  actor: businessAuditActorSchema,
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  correlationId: z.string().optional(),
  requestId: z.string().optional(),
  hash: z.string(),
  prevHash: z.string().optional(),
  dateBucket: z.string(),
});

export const businessAiActionSchema = z.object({
  id: z.string(),
  type: z.string(),
  simulation: z.boolean(),
  reason: z.string(),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string(),
  confirmToken: z.string().optional(),
});

export type BusinessAccount = z.infer<typeof businessAccountSchema>;
export type BusinessConfig = z.infer<typeof businessConfigSchema>;
export type BusinessCustomer = z.infer<typeof businessCustomerSchema>;
export type BusinessVendor = z.infer<typeof businessVendorSchema>;
export type BusinessInvoice = z.infer<typeof businessInvoiceSchema>;
export type BusinessPayment = z.infer<typeof businessPaymentSchema>;
export type BusinessJournalEntry = z.infer<typeof businessJournalEntrySchema>;
export type BusinessBankAccount = z.infer<typeof businessBankAccountSchema>;
export type BusinessBankTransaction = z.infer<typeof businessBankTransactionSchema>;
export type BusinessImportSource = z.infer<typeof businessImportSourceSchema>;
export type BusinessImportJob = z.infer<typeof businessImportJobSchema>;
export type BusinessReconcileRun = z.infer<typeof businessReconcileRunSchema>;
export type BusinessAuditEvent = z.infer<typeof businessAuditEventSchema>;
export type BusinessAiAction = z.infer<typeof businessAiActionSchema>;

export type BusinessCustomerInput = Pick<BusinessCustomer, "id" | "displayName"> &
  Partial<
    Pick<
      BusinessCustomer,
      "legalName" | "emails" | "billingAddress" | "shippingAddress" | "taxId" | "taxExempt" | "defaultTermsDays" | "preferredCurrency" | "notes" | "status"
    >
  >;

export type BusinessVendorInput = Pick<BusinessVendor, "id" | "displayName"> &
  Partial<
    Pick<
      BusinessVendor,
      "legalName" | "emails" | "billingAddress" | "taxId" | "paymentDetails" | "w9Status" | "preferredCurrency" | "notes" | "status"
    >
  >;

export type BusinessInvoiceInput = {
  id?: string;
  customerId: string;
  issueDate?: string;
  dueDate?: string;
  currency?: string;
  lines: Array<{
    lineId?: string;
    description: string;
    quantity: number;
    unitPriceMinor: number;
    discountMinor?: number;
    taxRateBps?: number;
    accountId?: string;
  }>;
  notes?: string;
};

export type BusinessPaymentInput = {
  id?: string;
  invoiceId?: string;
  customerId?: string;
  amountMinor: number;
  currency?: string;
  postedDate?: string;
  method?: "cash" | "ach" | "card" | "check" | "other";
  reference?: string;
  type?: "payment" | "refund" | "writeoff";
  bankAccountId?: string;
};
