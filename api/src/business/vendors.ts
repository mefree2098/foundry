import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { businessVendorInputSchema, businessVendorSchema, type BusinessVendor } from "./schemas.js";
import { nowIso } from "./utils.js";

export async function listVendors(): Promise<BusinessVendor[]> {
  const container = database.container(containers.businessVendors);
  const { resources } = await container.items.query("SELECT * FROM c ORDER BY c.displayName ASC").fetchAll();
  return resources.map((resource) => businessVendorSchema.safeParse(resource)).filter((parsed) => parsed.success).map((parsed) => parsed.data);
}

export async function getVendorById(id: string): Promise<BusinessVendor | null> {
  const container = database.container(containers.businessVendors);
  const { resources } = await container.items
    .query({
      query: "SELECT TOP 1 * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: id }],
    })
    .fetchAll();

  if (!resources[0]) return null;
  const parsed = businessVendorSchema.safeParse(resources[0]);
  return parsed.success ? parsed.data : null;
}

export async function upsertVendor(payload: unknown): Promise<BusinessVendor> {
  const parsedInput = businessVendorInputSchema.parse(payload);
  const id = parsedInput.id.trim().toLowerCase();
  const before = await getVendorById(id);

  const vendor = businessVendorSchema.parse({
    ...before,
    ...parsedInput,
    id,
    pk: id,
    emails: (parsedInput.emails || before?.emails || []).map((email) => email.trim()).filter(Boolean),
    createdAt: before?.createdAt || nowIso(),
    updatedAt: nowIso(),
    preferredCurrency: parsedInput.preferredCurrency || before?.preferredCurrency || "USD",
    w9Status: parsedInput.w9Status || before?.w9Status || "unknown",
    status: parsedInput.status || before?.status || "active",
  });

  const container = database.container(containers.businessVendors);
  await container.items.upsert(vendor);
  return vendor;
}

export async function deleteVendor(id: string): Promise<void> {
  const container = database.container(containers.businessVendors);
  await container.item(id, id).delete();
}
