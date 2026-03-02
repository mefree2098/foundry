import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { importJobRunInputSchema, importJobSchema, importSourceInputSchema, importSourceSchema, type ImportJob, type ImportSource } from "./schemas.js";
import { makeEntityId, nowIso } from "./utils.js";

type ListJobsOptions = {
  limit: number;
  cursor?: string;
  sourceId?: string;
};

export async function listImportSources(): Promise<ImportSource[]> {
  const container = database.container(containers.businessImportSources);
  const { resources } = await container.items.query("SELECT * FROM c ORDER BY c.updatedAt DESC").fetchAll();
  return resources.map((resource) => importSourceSchema.safeParse(resource)).filter((parsed) => parsed.success).map((parsed) => parsed.data);
}

export async function upsertImportSource(payload: unknown): Promise<ImportSource> {
  const parsedInput = importSourceInputSchema.parse(payload);
  const id = (parsedInput.id || makeEntityId("source")).toLowerCase();

  const container = database.container(containers.businessImportSources);
  const { resources } = await container.items
    .query({
      query: "SELECT TOP 1 * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: id }],
    })
    .fetchAll();

  const existing = resources[0] ? importSourceSchema.safeParse(resources[0]) : null;

  const source = importSourceSchema.parse({
    ...(existing && existing.success ? existing.data : {}),
    id,
    pk: id,
    type: parsedInput.type,
    config: parsedInput.config || (existing && existing.success ? existing.data.config : {}),
    schedule: parsedInput.schedule || (existing && existing.success ? existing.data.schedule : undefined),
    state: parsedInput.state || (existing && existing.success ? existing.data.state : "active"),
    createdAt: existing && existing.success ? existing.data.createdAt : nowIso(),
    updatedAt: nowIso(),
    lastRunAt: existing && existing.success ? existing.data.lastRunAt : undefined,
  });

  await container.items.upsert(source);
  return source;
}

export async function listImportJobs(options: ListJobsOptions): Promise<{ items: ImportJob[]; cursor?: string }> {
  const limit = Math.min(Math.max(options.limit, 1), 200);
  const filters: string[] = [];
  const parameters: Array<{ name: string; value: string }> = [];

  if (options.sourceId) {
    filters.push("c.sourceId = @sourceId");
    parameters.push({ name: "@sourceId", value: options.sourceId });
  }
  if (options.cursor) {
    filters.push("c.startedAt < @cursor");
    parameters.push({ name: "@cursor", value: options.cursor });
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const query = `SELECT TOP ${limit} * FROM c ${where} ORDER BY c.startedAt DESC`;

  const container = database.container(containers.businessImportJobs);
  const { resources } = await container.items.query({ query, parameters }).fetchAll();
  const items = resources.map((resource) => importJobSchema.safeParse(resource)).filter((parsed) => parsed.success).map((parsed) => parsed.data);

  return {
    items,
    cursor: items.length ? items[items.length - 1].startedAt : undefined,
  };
}

export async function getImportJobById(id: string): Promise<ImportJob | null> {
  const container = database.container(containers.businessImportJobs);
  const { resources } = await container.items
    .query({
      query: "SELECT TOP 1 * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: id }],
    })
    .fetchAll();

  if (!resources[0]) return null;
  const parsed = importJobSchema.safeParse(resources[0]);
  return parsed.success ? parsed.data : null;
}

export async function runImportJob(payload: unknown): Promise<ImportJob> {
  const parsedInput = importJobRunInputSchema.parse(payload);
  const sourceContainer = database.container(containers.businessImportSources);
  const { resources } = await sourceContainer.items
    .query({
      query: "SELECT TOP 1 * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: parsedInput.sourceId }],
    })
    .fetchAll();

  if (!resources[0]) throw new Error(`Import source ${parsedInput.sourceId} not found`);
  const sourceParsed = importSourceSchema.safeParse(resources[0]);
  if (!sourceParsed.success) throw new Error(`Import source ${parsedInput.sourceId} is invalid`);

  const startedAt = nowIso();
  const id = makeEntityId("job");

  const job = importJobSchema.parse({
    id,
    pk: parsedInput.sourceId,
    sourceId: parsedInput.sourceId,
    startedAt,
    finishedAt: nowIso(),
    status: "completed",
    artifactRefs: [],
    idempotencyKey: parsedInput.idempotencyKey,
    stats: {
      rowsRead: 0,
      rowsImported: 0,
      rowsSkipped: 0,
    },
    errors: [],
    resultingJournalEntryIds: [],
  });

  const jobContainer = database.container(containers.businessImportJobs);
  await jobContainer.items.upsert(job);

  const source = sourceParsed.data;
  await sourceContainer.items.upsert({
    ...source,
    lastRunAt: nowIso(),
    updatedAt: nowIso(),
  });

  return job;
}
