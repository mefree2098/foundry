import { CosmosClient } from "@azure/cosmos";

function parseConnectionString(cs: string) {
  const parts = Object.fromEntries(
    cs
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.split("=", 2) as [string, string]),
  );
  return { endpoint: parts.AccountEndpoint, key: parts.AccountKey };
}

const connectionString = process.env.COSMOS_CONNECTION_STRING;
const endpointEnv = process.env.COSMOS_ENDPOINT;
const keyEnv = process.env.COSMOS_KEY;

let endpoint = endpointEnv;
let key = keyEnv;

if (connectionString) {
  const parsed = parseConnectionString(connectionString);
  endpoint = parsed.endpoint || endpoint;
  key = parsed.key || key;
} else if (keyEnv && keyEnv.includes("AccountEndpoint=")) {
  // Support users accidentally pasting the full connection string into COSMOS_KEY
  const parsed = parseConnectionString(keyEnv);
  endpoint = parsed.endpoint || endpoint;
  key = parsed.key;
}

const databaseId = process.env.COSMOS_DATABASE || "ntechr-db";

if (!endpoint || !key) {
  throw new Error("Missing Cosmos DB configuration (COSMOS_ENDPOINT/COSMOS_KEY or COSMOS_CONNECTION_STRING).");
}

export const cosmosClient = new CosmosClient({ endpoint, key });
export const database = cosmosClient.database(databaseId);
