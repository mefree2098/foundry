import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { getBankAccountById } from "./banking.js";
import { journalEntrySchema, reconcileRunInputSchema, reconcileRunSchema, type BankTransaction, type ReconcileRun } from "./schemas.js";
import { makeEntityId, nowIso, todayIsoDate } from "./utils.js";

type EntryMatchCandidate = {
  journalEntryId: string;
  postedDate: string;
  amountMinor: number;
};

function daysBetween(a: string, b: string) {
  const da = new Date(`${a}T00:00:00.000Z`).getTime();
  const db = new Date(`${b}T00:00:00.000Z`).getTime();
  return Math.abs(Math.round((da - db) / (24 * 60 * 60 * 1000)));
}

function scoreCandidate(tx: BankTransaction, candidate: EntryMatchCandidate) {
  const amountDelta = Math.abs(tx.amountMinor - candidate.amountMinor);
  const dateDelta = daysBetween(tx.postedDate, candidate.postedDate);
  const amountScore = amountDelta === 0 ? 1 : amountDelta <= 50 ? 0.85 : amountDelta <= 200 ? 0.65 : 0.3;
  const dateScore = dateDelta === 0 ? 1 : dateDelta <= 1 ? 0.92 : dateDelta <= 3 ? 0.8 : dateDelta <= 7 ? 0.55 : 0.25;
  return Number((amountScore * dateScore).toFixed(2));
}

async function listJournalEntriesForAccount(cashAccountId: string): Promise<EntryMatchCandidate[]> {
  const container = database.container(containers.businessJournalEntries);
  const { resources } = await container.items.query("SELECT * FROM c").fetchAll();
  const entries = resources.map((resource) => journalEntrySchema.safeParse(resource)).filter((parsed) => parsed.success).map((parsed) => parsed.data);

  const candidates: EntryMatchCandidate[] = [];
  for (const entry of entries) {
    const accountLines = entry.lines.filter((line) => line.accountId === cashAccountId);
    if (!accountLines.length) continue;
    const amountMinor = accountLines.reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0);
    candidates.push({
      journalEntryId: entry.id,
      postedDate: entry.postedDate,
      amountMinor,
    });
  }
  return candidates;
}

async function listUnreconciledTransactions(bankAccountId: string, throughDate: string): Promise<BankTransaction[]> {
  const container = database.container(containers.businessBankTransactions);
  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.bankAccountId = @bankAccountId AND c.postedDate <= @throughDate AND c.status != 'reconciled'",
      parameters: [
        { name: "@bankAccountId", value: bankAccountId },
        { name: "@throughDate", value: throughDate },
      ],
    })
    .fetchAll();

  return resources.map((resource) => (resource as Record<string, unknown>)).map((resource) => ({
    id: String(resource.id || ""),
    pk: String(resource.pk || bankAccountId),
    bankAccountId: String(resource.bankAccountId || bankAccountId),
    postedDate: String(resource.postedDate || throughDate),
    authorizedDate: typeof resource.authorizedDate === "string" ? resource.authorizedDate : undefined,
    description: String(resource.description || ""),
    merchant: typeof resource.merchant === "string" ? resource.merchant : undefined,
    categoryHint: typeof resource.categoryHint === "string" ? resource.categoryHint : undefined,
    amountMinor: Number(resource.amountMinor || 0),
    currency: String(resource.currency || "USD"),
    raw: typeof resource.raw === "object" ? (resource.raw as Record<string, unknown>) : undefined,
    match:
      resource.match && typeof resource.match === "object"
        ? {
            journalEntryIds: Array.isArray((resource.match as { journalEntryIds?: unknown }).journalEntryIds)
              ? ((resource.match as { journalEntryIds?: unknown[] }).journalEntryIds || []).map((entry) => String(entry))
              : [],
            confidence:
              typeof (resource.match as { confidence?: unknown }).confidence === "number"
                ? Number((resource.match as { confidence?: number }).confidence)
                : undefined,
          }
        : undefined,
    status: ["unreviewed", "categorized", "reconciled", "ignored"].includes(String(resource.status || ""))
      ? (resource.status as BankTransaction["status"])
      : "unreviewed",
    sourceRef: typeof resource.sourceRef === "string" ? resource.sourceRef : undefined,
    createdAt: String(resource.createdAt || nowIso()),
    updatedAt: String(resource.updatedAt || nowIso()),
  }));
}

export async function runReconciliation(payload: unknown): Promise<ReconcileRun> {
  const parsedInput = reconcileRunInputSchema.parse(payload);
  const bankAccount = await getBankAccountById(parsedInput.bankAccountId);
  if (!bankAccount) throw new Error(`Bank account ${parsedInput.bankAccountId} not found`);

  const throughDate = parsedInput.throughDate || todayIsoDate();
  const startedAt = nowIso();

  const transactions = await listUnreconciledTransactions(parsedInput.bankAccountId, throughDate);
  const candidates = await listJournalEntriesForAccount(bankAccount.ledgerCashAccountId);

  const suggestions = transactions
    .map((tx) => {
      let best: EntryMatchCandidate | undefined;
      let bestScore = 0;
      for (const candidate of candidates) {
        const score = scoreCandidate(tx, candidate);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }

      return {
        bankTransactionId: tx.id,
        journalEntryId: best?.journalEntryId,
        confidence: bestScore,
        reason: best ? `Matched on amount/date proximity (${bestScore})` : "No candidate",
      };
    })
    .filter((suggestion) => suggestion.confidence >= 0.55)
    .sort((a, b) => b.confidence - a.confidence);

  let reconciled = 0;
  if (parsedInput.apply) {
    const txContainer = database.container(containers.businessBankTransactions);
    for (const suggestion of suggestions) {
      if (!suggestion.journalEntryId) continue;
      const tx = transactions.find((item) => item.id === suggestion.bankTransactionId);
      if (!tx) continue;

      const next = {
        ...tx,
        status: "reconciled" as const,
        match: {
          journalEntryIds: [suggestion.journalEntryId],
          confidence: suggestion.confidence,
        },
        updatedAt: nowIso(),
      };

      await txContainer.items.upsert(next);
      reconciled += 1;
    }
  }

  const run = reconcileRunSchema.parse({
    id: makeEntityId("reconcile"),
    pk: parsedInput.bankAccountId,
    bankAccountId: parsedInput.bankAccountId,
    throughDate,
    status: "completed",
    startedAt,
    finishedAt: nowIso(),
    summary: {
      reviewed: transactions.length,
      reconciled,
      unmatched: Math.max(0, transactions.length - reconciled),
    },
    suggestions,
  });

  const runContainer = database.container(containers.businessReconcileRuns);
  await runContainer.items.upsert(run);

  return run;
}

export async function getReconcileStatus(bankAccountId?: string, runId?: string): Promise<ReconcileRun | null> {
  const container = database.container(containers.businessReconcileRuns);

  if (runId) {
    const { resources } = await container.items
      .query({
        query: "SELECT TOP 1 * FROM c WHERE c.id = @id",
        parameters: [{ name: "@id", value: runId }],
      })
      .fetchAll();

    if (!resources[0]) return null;
    const parsed = reconcileRunSchema.safeParse(resources[0]);
    return parsed.success ? parsed.data : null;
  }

  if (bankAccountId) {
    const { resources } = await container.items
      .query({
        query: "SELECT TOP 1 * FROM c WHERE c.bankAccountId = @bankAccountId ORDER BY c.startedAt DESC",
        parameters: [{ name: "@bankAccountId", value: bankAccountId }],
      })
      .fetchAll();

    if (!resources[0]) return null;
    const parsed = reconcileRunSchema.safeParse(resources[0]);
    return parsed.success ? parsed.data : null;
  }

  const { resources } = await container.items.query("SELECT TOP 1 * FROM c ORDER BY c.startedAt DESC").fetchAll();
  if (!resources[0]) return null;
  const parsed = reconcileRunSchema.safeParse(resources[0]);
  return parsed.success ? parsed.data : null;
}
