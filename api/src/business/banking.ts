import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { getBusinessConfig } from "./config.js";
import { assertBankFeedIntegrationReady } from "./integrations.js";
import {
  bankAccountInputSchema,
  bankAccountSchema,
  bankImportInputSchema,
  bankTransactionSchema,
  type BankAccount,
  type BankTransaction,
} from "./schemas.js";
import { hashPayload, makeEntityId, nowIso } from "./utils.js";

type ListBankTransactionsOptions = {
  bankAccountId?: string;
  status?: BankTransaction["status"];
  limit: number;
  cursor?: string;
};

export async function getBankAccountById(id: string): Promise<BankAccount | null> {
  const container = database.container(containers.businessBankAccounts);
  const { resources } = await container.items
    .query({
      query: "SELECT TOP 1 * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: id }],
    })
    .fetchAll();

  if (!resources[0]) return null;
  const parsed = bankAccountSchema.safeParse(resources[0]);
  return parsed.success ? parsed.data : null;
}

export async function listBankAccounts(): Promise<BankAccount[]> {
  const container = database.container(containers.businessBankAccounts);
  const { resources } = await container.items.query("SELECT * FROM c ORDER BY c.displayName ASC").fetchAll();
  return resources.map((resource) => bankAccountSchema.safeParse(resource)).filter((parsed) => parsed.success).map((parsed) => parsed.data);
}

export async function upsertBankAccount(payload: unknown): Promise<BankAccount> {
  const parsedInput = bankAccountInputSchema.parse(payload);
  const config = await getBusinessConfig();

  const id = (parsedInput.id || makeEntityId("bank")).toLowerCase();
  const existing = await getBankAccountById(id);
  const feedType = parsedInput.feedType || existing?.feedType || "manual";
  const integrationId = parsedInput.integrationId || existing?.integrationId;
  await assertBankFeedIntegrationReady(feedType, integrationId);

  const account = bankAccountSchema.parse({
    ...existing,
    id,
    pk: id,
    displayName: parsedInput.displayName,
    institution: parsedInput.institution,
    mask: parsedInput.mask,
    currency: parsedInput.currency || existing?.currency || config.baseCurrency,
    feedType,
    integrationId,
    connectionState: parsedInput.connectionState || existing?.connectionState || "connected",
    ledgerCashAccountId: parsedInput.ledgerCashAccountId || existing?.ledgerCashAccountId || config.systemAccountMap.cash,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    lastSyncAt: existing?.lastSyncAt,
  });

  const container = database.container(containers.businessBankAccounts);
  await container.items.upsert(account);
  return account;
}

export async function listBankTransactions(options: ListBankTransactionsOptions): Promise<{ items: BankTransaction[]; cursor?: string }> {
  const limit = Math.min(Math.max(options.limit, 1), 300);
  const filters: string[] = [];
  const parameters: Array<{ name: string; value: string }> = [];

  if (options.bankAccountId) {
    filters.push("c.bankAccountId = @bankAccountId");
    parameters.push({ name: "@bankAccountId", value: options.bankAccountId });
  }
  if (options.status) {
    filters.push("c.status = @status");
    parameters.push({ name: "@status", value: options.status });
  }
  if (options.cursor) {
    filters.push("c.updatedAt < @cursor");
    parameters.push({ name: "@cursor", value: options.cursor });
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const query = `SELECT TOP ${limit} * FROM c ${where} ORDER BY c.updatedAt DESC`;

  const container = database.container(containers.businessBankTransactions);
  const { resources } = await container.items.query({ query, parameters }).fetchAll();
  const items = resources.map((resource) => bankTransactionSchema.safeParse(resource)).filter((parsed) => parsed.success).map((parsed) => parsed.data);

  return {
    items,
    cursor: items.length ? items[items.length - 1].updatedAt : undefined,
  };
}

export async function importBankTransactions(payload: unknown): Promise<{ imported: number; skipped: number; items: BankTransaction[] }> {
  const parsedInput = bankImportInputSchema.parse(payload);
  const bankAccount = await getBankAccountById(parsedInput.bankAccountId);
  if (!bankAccount) throw new Error(`Bank account ${parsedInput.bankAccountId} not found`);

  const container = database.container(containers.businessBankTransactions);

  let imported = 0;
  let skipped = 0;
  const items: BankTransaction[] = [];

  for (const tx of parsedInput.transactions) {
    const id = hashPayload([
      parsedInput.bankAccountId,
      tx.postedDate,
      tx.description.trim().toLowerCase(),
      tx.amountMinor,
      tx.sourceRef || "",
    ]).slice(0, 24);

    const candidate = bankTransactionSchema.parse({
      id,
      pk: parsedInput.bankAccountId,
      bankAccountId: parsedInput.bankAccountId,
      postedDate: tx.postedDate,
      authorizedDate: tx.authorizedDate,
      description: tx.description,
      merchant: tx.merchant,
      categoryHint: tx.categoryHint,
      amountMinor: tx.amountMinor,
      currency: tx.currency || bankAccount.currency,
      raw: tx.raw,
      status: "unreviewed",
      sourceRef: tx.sourceRef,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    try {
      await container.item(candidate.id, candidate.pk).read();
      skipped += 1;
      continue;
    } catch {
      await container.items.upsert(candidate);
      imported += 1;
      items.push(candidate);
    }
  }

  const accountContainer = database.container(containers.businessBankAccounts);
  await accountContainer.items.upsert({
    ...bankAccount,
    lastSyncAt: nowIso(),
    updatedAt: nowIso(),
  });

  return { imported, skipped, items };
}
