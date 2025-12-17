// Simple Cosmos DB (SQL API) export/import between two accounts/databases.
// Usage (Node 20+):
//   npm install @azure/cosmos --no-save
//   node scripts/cosmos-migrate.js
//
// Required env vars:
//   SOURCE_CONN_STRING  - Source Cosmos connection string
//   SOURCE_DB           - Source database name
//   TARGET_CONN_STRING  - Target Cosmos connection string
//   TARGET_DB           - Target database name (will be created if missing)
//
// Containers migrated: platforms (/id), news (/id), topics (/id), config (/id), subscribers (/id)

import { CosmosClient } from "@azure/cosmos";

const CONTAINERS = [
  { name: "platforms", partitionKey: "/id" },
  { name: "news", partitionKey: "/id" },
  { name: "topics", partitionKey: "/id" },
  { name: "config", partitionKey: "/id" },
  { name: "subscribers", partitionKey: "/id" },
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const SOURCE_CONN_STRING = required("SOURCE_CONN_STRING");
const SOURCE_DB = required("SOURCE_DB");
const TARGET_CONN_STRING = required("TARGET_CONN_STRING");
const TARGET_DB = required("TARGET_DB");

const BATCH_SIZE = 100;

async function ensureContainer(client, dbName, { name, partitionKey }) {
  const { database } = await client.databases.createIfNotExists({ id: dbName });
  await database.containers.createIfNotExists({
    id: name,
    partitionKey: { paths: [partitionKey], kind: "Hash" },
  });
  return database.container(name);
}

async function fetchAll(container) {
  const all = [];
  const iterator = container.items.readAll();
  while (true) {
    const { resources, hasMoreResults } = await iterator.fetchNext();
    if (resources && resources.length) all.push(...resources);
    if (!hasMoreResults) break;
  }
  return all;
}

async function migrateContainer(srcClient, tgtClient, dbNames, def) {
  const { name, partitionKey } = def;
  console.log(`\nMigrating container "${name}"...`);

  const srcContainer = srcClient.database(dbNames.source).container(name);
  const tgtContainer = await ensureContainer(tgtClient, dbNames.target, def);

  const docs = await fetchAll(srcContainer);
  console.log(`  Fetched ${docs.length} docs from source.`);

  if (!docs.length) return;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((doc) =>
        tgtContainer.items.upsert(doc, { partitionKey: doc[partitionKey.replace("/", "")] }).catch((err) => {
          console.error(`    Upsert failed for id=${doc.id}: ${err.message}`);
          throw err;
        }),
      ),
    );
    console.log(`  Upserted ${Math.min(i + BATCH_SIZE, docs.length)}/${docs.length}`);
  }
}

async function main() {
  console.log("Starting Cosmos migration...");
  const srcClient = new CosmosClient(SOURCE_CONN_STRING);
  const tgtClient = new CosmosClient(TARGET_CONN_STRING);

  for (const def of CONTAINERS) {
    await migrateContainer(srcClient, tgtClient, { source: SOURCE_DB, target: TARGET_DB }, def);
  }

  console.log("\nMigration complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
