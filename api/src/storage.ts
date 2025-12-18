import { BlobSASPermissions, BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters } from "@azure/storage-blob";

const connectionString = process.env.STORAGE_CONNECTION_STRING;
const containerName = process.env.STORAGE_CONTAINER_NAME || "media";

type ConnParts = { AccountName: string; AccountKey: string };

function parseConnectionString(cs: string): ConnParts {
  const parts = Object.fromEntries(
    cs.split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.split("=", 2) as [string, string]),
  );
  if (!parts.AccountName || !parts.AccountKey) throw new Error("Invalid storage connection string");
  return { AccountName: parts.AccountName, AccountKey: parts.AccountKey };
}

let cachedCreds: StorageSharedKeyCredential | null = null;
let cachedBlobService: BlobServiceClient | null = null;

function ensureStorage() {
  if (cachedCreds && cachedBlobService) return { creds: cachedCreds, blobService: cachedBlobService };
  if (!connectionString) throw new Error("STORAGE_CONNECTION_STRING not set");
  const { AccountName, AccountKey } = parseConnectionString(connectionString);
  cachedCreds = new StorageSharedKeyCredential(AccountName, AccountKey);
  cachedBlobService = BlobServiceClient.fromConnectionString(connectionString);
  return { creds: cachedCreds, blobService: cachedBlobService };
}

export async function getSasForBlob(filename: string, contentType: string) {
  const { blobService, creds } = ensureStorage();
  const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const container = blobService.getContainerClient(containerName);
  await container.createIfNotExists({ access: "blob" });

  const expiresOn = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName: safeName,
      permissions: BlobSASPermissions.parse("rcw"),
      expiresOn,
      contentType,
    },
    creds,
  ).toString();

  const blobUrl = `${container.url}/${safeName}`;
  const uploadUrl = `${blobUrl}?${sas}`;
  return { uploadUrl, blobUrl, expiresOn };
}
