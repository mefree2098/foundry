import { z } from "zod";

const isoDateTimeSchema = z.string().min(10);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const currencySchema = z.string().trim().length(3).transform((value) => value.toUpperCase());
const minorAmountSchema = z.number().int();

const entityIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9-]*$/i, "Use letters, numbers, and hyphens only");

export const accountTypeSchema = z.enum(["asset", "liability", "equity", "income", "expense"]);
export const normalBalanceSchema = z.enum(["debit", "credit"]);

export const businessAccountSchema = z.object({
  id: entityIdSchema,
  pk: z.literal("coa").default("coa"),
  name: z.string().trim().min(1),
  type: accountTypeSchema,
  subtype: z.string().trim().min(1).optional(),
  normalBalance: normalBalanceSchema,
  isSystem: z.boolean().default(false),
  isArchived: z.boolean().default(false),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const systemAccountMapSchema = z.object({
  accountsReceivable: entityIdSchema,
  cash: entityIdSchema,
  undepositedFunds: entityIdSchema,
  revenue: entityIdSchema,
  salesTaxPayable: entityIdSchema,
  badDebtExpense: entityIdSchema,
  refunds: entityIdSchema,
  bankFees: entityIdSchema,
  ownerDraw: entityIdSchema,
});

export const businessConfigSchema = z.object({
  id: z.literal("global").default("global"),
  pk: z.literal("global").default("global"),
  baseCurrency: currencySchema.default("USD"),
  invoiceNumbering: z
    .object({
      prefix: z.string().trim().max(20).default("INV-"),
      nextSequence: z.number().int().positive().default(1),
      padLength: z.number().int().min(1).max(12).default(5),
    })
    .default({
      prefix: "INV-",
      nextSequence: 1,
      padLength: 5,
    }),
  chartOfAccounts: z.array(businessAccountSchema).default([]),
  systemAccountMap: systemAccountMapSchema,
  promptSetId: z.string().trim().min(1).optional(),
  activePromptVersion: z.string().trim().min(1).optional(),
  safeMode: z.boolean().default(true),
  simulationDefault: z.boolean().default(true),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().optional(),
});

export const businessConfigInputSchema = z
  .object({
    baseCurrency: currencySchema.optional(),
    invoiceNumbering: z
      .object({
        prefix: z.string().trim().max(20).optional(),
        nextSequence: z.number().int().positive().optional(),
        padLength: z.number().int().min(1).max(12).optional(),
      })
      .optional(),
    promptSetId: z.string().trim().min(1).optional(),
    activePromptVersion: z.string().trim().min(1).optional(),
    safeMode: z.boolean().optional(),
    simulationDefault: z.boolean().optional(),
  })
  .strict();

const customerIdSchema = entityIdSchema;

export const businessCustomerSchema = z.object({
  id: customerIdSchema,
  pk: customerIdSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  displayName: z.string().trim().min(1),
  legalName: z.string().trim().min(1).optional(),
  emails: z.array(z.string().trim().email()).default([]),
  billingAddress: z.string().trim().min(1).optional(),
  shippingAddress: z.string().trim().min(1).optional(),
  taxId: z.string().trim().min(1).optional(),
  taxExempt: z.boolean().optional(),
  defaultTermsDays: z.number().int().min(0).max(365).default(30),
  preferredCurrency: currencySchema.default("USD"),
  notes: z.string().trim().min(1).optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const businessCustomerInputSchema = z
  .object({
    id: customerIdSchema,
    displayName: z.string().trim().min(1),
    legalName: z.string().trim().min(1).optional(),
    emails: z.array(z.string().trim().email()).optional(),
    billingAddress: z.string().trim().min(1).optional(),
    shippingAddress: z.string().trim().min(1).optional(),
    taxId: z.string().trim().min(1).optional(),
    taxExempt: z.boolean().optional(),
    defaultTermsDays: z.number().int().min(0).max(365).optional(),
    preferredCurrency: currencySchema.optional(),
    notes: z.string().trim().min(1).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  })
  .strict();

export const businessVendorSchema = z.object({
  id: customerIdSchema,
  pk: customerIdSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  displayName: z.string().trim().min(1),
  legalName: z.string().trim().min(1).optional(),
  emails: z.array(z.string().trim().email()).default([]),
  billingAddress: z.string().trim().min(1).optional(),
  taxId: z.string().trim().min(1).optional(),
  paymentDetails: z.string().trim().min(1).optional(),
  w9Status: z.enum(["unknown", "requested", "received"]).default("unknown"),
  preferredCurrency: currencySchema.default("USD"),
  notes: z.string().trim().min(1).optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const businessVendorInputSchema = z
  .object({
    id: customerIdSchema,
    displayName: z.string().trim().min(1),
    legalName: z.string().trim().min(1).optional(),
    emails: z.array(z.string().trim().email()).optional(),
    billingAddress: z.string().trim().min(1).optional(),
    taxId: z.string().trim().min(1).optional(),
    paymentDetails: z.string().trim().min(1).optional(),
    w9Status: z.enum(["unknown", "requested", "received"]).optional(),
    preferredCurrency: currencySchema.optional(),
    notes: z.string().trim().min(1).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  })
  .strict();

const invoiceLineBaseSchema = z.object({
  lineId: z.string().trim().min(1),
  description: z.string().trim().min(1),
  quantity: z.number().positive(),
  unitPriceMinor: z.number().int().nonnegative(),
  discountMinor: z.number().int().nonnegative().default(0),
  taxRateBps: z.number().int().min(0).max(10000).default(0),
  accountId: entityIdSchema,
  metadata: z.record(z.string(), z.string()).optional(),
});

export const invoiceLineSchema = invoiceLineBaseSchema.extend({
  subtotalMinor: z.number().int(),
  taxMinor: z.number().int(),
  totalMinor: z.number().int(),
});

export const invoiceLineInputSchema = invoiceLineBaseSchema.omit({ lineId: true, accountId: true }).extend({
  lineId: z.string().trim().min(1).optional(),
  accountId: entityIdSchema.optional(),
});

export const invoiceTotalsSchema = z.object({
  subtotalMinor: z.number().int(),
  taxTotalMinor: z.number().int(),
  discountTotalMinor: z.number().int(),
  totalMinor: z.number().int(),
  amountPaidMinor: z.number().int().nonnegative().default(0),
  amountRefundedMinor: z.number().int().nonnegative().default(0),
  amountWrittenOffMinor: z.number().int().nonnegative().default(0),
  amountDueMinor: z.number().int(),
});

export const invoiceStatusSchema = z.enum(["draft", "sent", "partially_paid", "paid", "void"]);

export const invoicePdfSchema = z.object({
  blobUrl: z.string().url().optional(),
  generatedAt: isoDateTimeSchema.optional(),
  templateVersion: z.string().optional(),
  contentHash: z.string().optional(),
});

export const invoiceDeliveryLogSchema = z.object({
  attemptedAt: isoDateTimeSchema,
  recipient: z.string().email(),
  status: z.enum(["sent", "failed"]),
  error: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export const invoiceSentSchema = z.object({
  sentAt: isoDateTimeSchema.optional(),
  sentTo: z.array(z.string().email()).default([]),
  deliveryLog: z.array(invoiceDeliveryLogSchema).default([]),
});

export const businessInvoiceSchema = z.object({
  id: entityIdSchema,
  pk: entityIdSchema,
  invoiceNumber: z.string().trim().min(1).optional(),
  sequenceId: z.number().int().positive().optional(),
  customerId: customerIdSchema,
  issueDate: isoDateSchema,
  dueDate: isoDateSchema,
  status: invoiceStatusSchema,
  currency: currencySchema,
  lines: z.array(invoiceLineSchema).min(1),
  totals: invoiceTotalsSchema,
  taxProfileSnapshot: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().trim().optional(),
  pdf: invoicePdfSchema.default({}),
  sent: invoiceSentSchema.default({ sentTo: [], deliveryLog: [] }),
  lastJournalEntryId: z.string().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const businessInvoiceInputSchema = z
  .object({
    id: entityIdSchema.optional(),
    customerId: customerIdSchema,
    issueDate: isoDateSchema.optional(),
    dueDate: isoDateSchema.optional(),
    currency: currencySchema.optional(),
    lines: z.array(invoiceLineInputSchema).min(1),
    notes: z.string().trim().optional(),
    status: invoiceStatusSchema.optional(),
    invoiceNumber: z.string().trim().min(1).optional(),
  })
  .strict();

export const paymentMethodSchema = z.enum(["cash", "ach", "card", "check", "other"]);
export const paymentTypeSchema = z.enum(["payment", "refund", "writeoff"]);

export const businessPaymentSchema = z.object({
  id: entityIdSchema,
  pk: entityIdSchema,
  invoiceId: entityIdSchema.optional(),
  customerId: customerIdSchema.optional(),
  amountMinor: z.number().int().positive(),
  currency: currencySchema,
  postedDate: isoDateSchema,
  method: paymentMethodSchema,
  reference: z.string().trim().min(1).optional(),
  type: paymentTypeSchema,
  bankAccountId: entityIdSchema.optional(),
  status: z.enum(["posted", "reversed"]).default("posted"),
  journalEntryId: z.string().min(1),
  reversalJournalEntryId: z.string().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const businessPaymentInputSchema = z
  .object({
    id: entityIdSchema.optional(),
    invoiceId: entityIdSchema.optional(),
    customerId: customerIdSchema.optional(),
    amountMinor: z.number().int().positive(),
    currency: currencySchema.optional(),
    postedDate: isoDateSchema.optional(),
    method: paymentMethodSchema.optional(),
    reference: z.string().trim().min(1).optional(),
    type: paymentTypeSchema.default("payment"),
    bankAccountId: entityIdSchema.optional(),
  })
  .strict();

export const journalLineSchema = z
  .object({
    accountId: entityIdSchema,
    debitMinor: minorAmountSchema.default(0),
    creditMinor: minorAmountSchema.default(0),
    currency: currencySchema,
    dimensions: z
      .object({
        customerId: entityIdSchema.optional(),
        vendorId: entityIdSchema.optional(),
        invoiceId: entityIdSchema.optional(),
        payoutId: entityIdSchema.optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.debitMinor < 0 || value.creditMinor < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Journal line amounts must be non-negative" });
    }
    if (value.debitMinor === 0 && value.creditMinor === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Journal line must include a debit or credit amount" });
    }
    if (value.debitMinor > 0 && value.creditMinor > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Journal line cannot have both debit and credit amounts" });
    }
  });

export const journalEntrySchema = z
  .object({
    id: z.string().min(1),
    pk: z.string().regex(/^\d{4}$/),
    fiscalYear: z.string().regex(/^\d{4}$/),
    postedDate: isoDateSchema,
    memo: z.string().trim().min(1),
    source: z.enum(["invoice", "payment", "import", "manual", "reconcile", "reversal"]),
    sourceRefId: z.string().optional(),
    lines: z.array(journalLineSchema).min(2),
    hash: z.string().min(1),
    prevHash: z.string().optional(),
    reversalOf: z.string().optional(),
    reversedBy: z.string().optional(),
    createdAt: isoDateTimeSchema,
  })
  .superRefine((value, ctx) => {
    const sumsByCurrency = new Map<string, { debit: number; credit: number }>();
    for (const line of value.lines) {
      const bucket = sumsByCurrency.get(line.currency) || { debit: 0, credit: 0 };
      bucket.debit += line.debitMinor;
      bucket.credit += line.creditMinor;
      sumsByCurrency.set(line.currency, bucket);
    }
    for (const [currency, sums] of sumsByCurrency.entries()) {
      if (sums.debit !== sums.credit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Journal entry is not balanced for ${currency}`,
        });
      }
    }
  });

export const bankAccountSchema = z.object({
  id: entityIdSchema,
  pk: entityIdSchema,
  displayName: z.string().trim().min(1),
  institution: z.string().trim().min(1).optional(),
  mask: z.string().trim().min(1).optional(),
  currency: currencySchema,
  feedType: z.enum(["plaid", "ofx", "manual"]),
  connectionState: z.enum(["connected", "needs_reauth", "disabled"]),
  ledgerCashAccountId: entityIdSchema,
  lastSyncAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const bankAccountInputSchema = z
  .object({
    id: entityIdSchema.optional(),
    displayName: z.string().trim().min(1),
    institution: z.string().trim().min(1).optional(),
    mask: z.string().trim().min(1).optional(),
    currency: currencySchema.optional(),
    feedType: z.enum(["plaid", "ofx", "manual"]).optional(),
    connectionState: z.enum(["connected", "needs_reauth", "disabled"]).optional(),
    ledgerCashAccountId: entityIdSchema.optional(),
  })
  .strict();

export const bankTransactionSchema = z.object({
  id: z.string().min(1),
  pk: entityIdSchema,
  bankAccountId: entityIdSchema,
  postedDate: isoDateSchema,
  authorizedDate: isoDateSchema.optional(),
  description: z.string().trim().min(1),
  merchant: z.string().trim().min(1).optional(),
  categoryHint: z.string().trim().min(1).optional(),
  amountMinor: z.number().int(),
  currency: currencySchema,
  raw: z.record(z.string(), z.unknown()).optional(),
  match: z
    .object({
      journalEntryIds: z.array(z.string()).default([]),
      confidence: z.number().min(0).max(1).optional(),
    })
    .optional(),
  status: z.enum(["unreviewed", "categorized", "reconciled", "ignored"]).default("unreviewed"),
  sourceRef: z.string().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const bankImportInputSchema = z
  .object({
    bankAccountId: entityIdSchema,
    source: z.enum(["csv", "ofx", "qfx", "manual"]).default("manual"),
    transactions: z
      .array(
        z.object({
          postedDate: isoDateSchema,
          description: z.string().trim().min(1),
          amountMinor: z.number().int(),
          currency: currencySchema.optional(),
          authorizedDate: isoDateSchema.optional(),
          merchant: z.string().trim().min(1).optional(),
          categoryHint: z.string().trim().min(1).optional(),
          raw: z.record(z.string(), z.unknown()).optional(),
          sourceRef: z.string().optional(),
        }),
      )
      .min(1),
  })
  .strict();

export const importSourceSchema = z.object({
  id: entityIdSchema,
  pk: entityIdSchema,
  type: z.enum(["steam", "apple", "googleplay", "distrokid", "bank-csv", "bank-ofx", "manual"]),
  config: z.record(z.string(), z.unknown()).default({}),
  schedule: z.string().optional(),
  state: z.enum(["active", "disabled"]).default("active"),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  lastRunAt: isoDateTimeSchema.optional(),
});

export const importSourceInputSchema = z
  .object({
    id: entityIdSchema.optional(),
    type: z.enum(["steam", "apple", "googleplay", "distrokid", "bank-csv", "bank-ofx", "manual"]),
    config: z.record(z.string(), z.unknown()).optional(),
    schedule: z.string().optional(),
    state: z.enum(["active", "disabled"]).optional(),
  })
  .strict();

export const importJobSchema = z.object({
  id: z.string().min(1),
  pk: entityIdSchema,
  sourceId: entityIdSchema,
  startedAt: isoDateTimeSchema,
  finishedAt: isoDateTimeSchema.optional(),
  status: z.enum(["queued", "running", "completed", "failed"]),
  artifactRefs: z.array(z.string()).default([]),
  idempotencyKey: z.string().optional(),
  stats: z
    .object({
      rowsRead: z.number().int().nonnegative().default(0),
      rowsImported: z.number().int().nonnegative().default(0),
      rowsSkipped: z.number().int().nonnegative().default(0),
    })
    .default({ rowsRead: 0, rowsImported: 0, rowsSkipped: 0 }),
  errors: z.array(z.string()).default([]),
  resultingJournalEntryIds: z.array(z.string()).default([]),
});

export const importJobRunInputSchema = z
  .object({
    sourceId: entityIdSchema,
    idempotencyKey: z.string().optional(),
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const reconcileSuggestionSchema = z.object({
  bankTransactionId: z.string(),
  journalEntryId: z.string().optional(),
  invoiceId: entityIdSchema.optional(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

export const reconcileRunSchema = z.object({
  id: z.string().min(1),
  pk: entityIdSchema,
  bankAccountId: entityIdSchema,
  throughDate: isoDateSchema,
  status: z.enum(["running", "completed", "failed"]),
  startedAt: isoDateTimeSchema,
  finishedAt: isoDateTimeSchema.optional(),
  summary: z
    .object({
      reviewed: z.number().int().nonnegative().default(0),
      reconciled: z.number().int().nonnegative().default(0),
      unmatched: z.number().int().nonnegative().default(0),
    })
    .default({ reviewed: 0, reconciled: 0, unmatched: 0 }),
  suggestions: z.array(reconcileSuggestionSchema).default([]),
  error: z.string().optional(),
});

export const reconcileRunInputSchema = z
  .object({
    bankAccountId: entityIdSchema,
    throughDate: isoDateSchema.optional(),
    apply: z.boolean().default(false),
  })
  .strict();

export const businessAuditActorSchema = z.object({
  userId: z.string().optional(),
  userDetails: z.string().optional(),
  roles: z.array(z.string()).default([]),
});

export const businessAuditEventSchema = z.object({
  id: z.string().min(1),
  timestamp: isoDateTimeSchema,
  dateBucket: z.string().regex(/^\d{4}-\d{2}$/),
  source: z.enum(["ui", "ai", "import", "system"]).default("ui"),
  actor: businessAuditActorSchema,
  actionType: z.string().min(1),
  entityRef: z.object({ type: z.string().min(1), id: z.string().min(1) }),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  correlationId: z.string().optional(),
  requestId: z.string().optional(),
  hash: z.string().min(1),
  prevHash: z.string().optional(),
});

export const businessAiMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

export const businessAiActionSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "invoice_create_draft",
    "invoice_issue",
    "invoice_send_email",
    "payment_record",
    "payment_refund",
    "payment_writeoff",
    "report_generate",
    "bank_reconcile_run",
  ]),
  simulation: z.boolean().default(true),
  reason: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().min(1),
  confirmToken: z.string().optional(),
});

export const businessAiChatRequestSchema = z
  .object({
    messages: z.array(businessAiMessageSchema).min(1),
    mode: z.enum(["safe", "simulation", "live"]).default("safe"),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const businessAiApplyRequestSchema = z
  .object({
    mode: z.enum(["simulation", "live"]).default("simulation"),
    actions: z.array(businessAiActionSchema).min(1),
    confirmToken: z.string().optional(),
  })
  .strict();

export type BusinessAccount = z.infer<typeof businessAccountSchema>;
export type BusinessConfig = z.infer<typeof businessConfigSchema>;
export type BusinessCustomer = z.infer<typeof businessCustomerSchema>;
export type BusinessVendor = z.infer<typeof businessVendorSchema>;
export type BusinessInvoice = z.infer<typeof businessInvoiceSchema>;
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;
export type InvoiceTotals = z.infer<typeof invoiceTotalsSchema>;
export type BusinessPayment = z.infer<typeof businessPaymentSchema>;
export type JournalEntry = z.infer<typeof journalEntrySchema>;
export type JournalLine = z.infer<typeof journalLineSchema>;
export type BankAccount = z.infer<typeof bankAccountSchema>;
export type BankTransaction = z.infer<typeof bankTransactionSchema>;
export type ImportSource = z.infer<typeof importSourceSchema>;
export type ImportJob = z.infer<typeof importJobSchema>;
export type ReconcileRun = z.infer<typeof reconcileRunSchema>;
export type BusinessAuditEvent = z.infer<typeof businessAuditEventSchema>;
export type BusinessAiAction = z.infer<typeof businessAiActionSchema>;
