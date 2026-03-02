import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { journalEntrySchema, type JournalEntry, type JournalLine } from "./schemas.js";
import { hashPayload, makeEntityId, nowIso } from "./utils.js";

type CreateJournalEntryInput = {
  postedDate: string;
  memo: string;
  source: JournalEntry["source"];
  sourceRefId?: string;
  lines: JournalLine[];
  reversalOf?: string;
};

async function getPrevHash(fiscalYear: string): Promise<string | undefined> {
  const container = database.container(containers.businessJournalEntries);
  try {
    const { resources } = await container.items
      .query<{ hash?: string }>({
        query: "SELECT TOP 1 c.hash FROM c WHERE c.fiscalYear = @fiscalYear ORDER BY c.createdAt DESC",
        parameters: [{ name: "@fiscalYear", value: fiscalYear }],
      })
      .fetchAll();
    return resources[0]?.hash;
  } catch {
    return undefined;
  }
}

export async function createJournalEntry(input: CreateJournalEntryInput): Promise<JournalEntry> {
  const postedDate = input.postedDate;
  const fiscalYear = postedDate.slice(0, 4);
  const createdAt = nowIso();
  const prevHash = await getPrevHash(fiscalYear);
  const id = makeEntityId("je");

  const draft = {
    id,
    pk: fiscalYear,
    fiscalYear,
    postedDate,
    memo: input.memo,
    source: input.source,
    sourceRefId: input.sourceRefId,
    lines: input.lines,
    prevHash,
    reversalOf: input.reversalOf,
    createdAt,
  };

  const hash = hashPayload([prevHash, draft]);
  const entry = journalEntrySchema.parse({ ...draft, hash });

  const container = database.container(containers.businessJournalEntries);
  await container.items.upsert(entry);
  return entry;
}

export async function createReversalEntry(entry: JournalEntry, options?: { postedDate?: string; memo?: string }): Promise<JournalEntry> {
  const lines: JournalLine[] = entry.lines.map((line) => ({
    ...line,
    debitMinor: line.creditMinor,
    creditMinor: line.debitMinor,
  }));

  const reversal = await createJournalEntry({
    postedDate: options?.postedDate || entry.postedDate,
    memo: options?.memo || `Reversal of ${entry.id}`,
    source: "reversal",
    sourceRefId: entry.sourceRefId,
    lines,
    reversalOf: entry.id,
  });

  const container = database.container(containers.businessJournalEntries);
  const updatedOriginal = { ...entry, reversedBy: reversal.id };
  await container.items.upsert(updatedOriginal);

  return reversal;
}

export async function getJournalEntryById(id: string): Promise<JournalEntry | null> {
  const container = database.container(containers.businessJournalEntries);
  const { resources } = await container.items
    .query({
      query: "SELECT TOP 1 * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: id }],
    })
    .fetchAll();

  if (!resources[0]) return null;
  const parsed = journalEntrySchema.safeParse(resources[0]);
  return parsed.success ? parsed.data : null;
}

export async function listJournalEntries(limit: number, cursor?: string): Promise<{ items: JournalEntry[]; cursor?: string }> {
  const cap = Math.min(Math.max(limit, 1), 200);
  const container = database.container(containers.businessJournalEntries);

  const query = cursor
    ? {
        query: `SELECT TOP ${cap} * FROM c WHERE c.createdAt < @cursor ORDER BY c.createdAt DESC`,
        parameters: [{ name: "@cursor", value: cursor }],
      }
    : `SELECT TOP ${cap} * FROM c ORDER BY c.createdAt DESC`;

  const { resources } = await container.items.query(query).fetchAll();
  const items = resources.map((resource) => journalEntrySchema.safeParse(resource)).filter((parsed) => parsed.success).map((parsed) => parsed.data);

  return {
    items,
    cursor: items.length ? items[items.length - 1].createdAt : undefined,
  };
}

export async function listAllJournalEntries(): Promise<JournalEntry[]> {
  const container = database.container(containers.businessJournalEntries);
  const { resources } = await container.items.query("SELECT * FROM c").fetchAll();
  return resources.map((resource) => journalEntrySchema.safeParse(resource)).filter((parsed) => parsed.success).map((parsed) => parsed.data);
}

export function computeTrialBalance(entries: JournalEntry[]) {
  const balances = new Map<string, number>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      const existing = balances.get(line.accountId) || 0;
      balances.set(line.accountId, existing + line.debitMinor - line.creditMinor);
    }
  }

  const total = Array.from(balances.values()).reduce((sum, value) => sum + value, 0);
  return {
    byAccount: Object.fromEntries(balances.entries()),
    total,
    balanced: total === 0,
  };
}
