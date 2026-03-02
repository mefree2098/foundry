import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { createDefaultBusinessConfig } from "./defaults.js";
import { businessConfigSchema, type BusinessConfig } from "./schemas.js";
import { nowIso } from "./utils.js";

const CONFIG_ID = "global";

export async function getBusinessConfig(): Promise<BusinessConfig> {
  const container = database.container(containers.businessConfig);
  try {
    const { resource } = await container.item(CONFIG_ID, CONFIG_ID).read();
    const parsed = businessConfigSchema.safeParse(resource || {});
    if (parsed.success) return parsed.data;
  } catch {
    // fall through to default
  }

  const fallback = createDefaultBusinessConfig();
  await container.items.upsert(fallback);
  return fallback;
}

export async function saveBusinessConfig(next: BusinessConfig): Promise<BusinessConfig> {
  const container = database.container(containers.businessConfig);
  const parsed = businessConfigSchema.parse(next);
  await container.items.upsert(parsed);
  return parsed;
}

export async function reserveNextInvoiceNumber(): Promise<{ sequenceId: number; invoiceNumber: string; config: BusinessConfig }> {
  const container = database.container(containers.businessConfig);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const read = await container.item(CONFIG_ID, CONFIG_ID).read().catch(async () => {
      const fallback = createDefaultBusinessConfig();
      await container.items.upsert(fallback);
      return container.item(CONFIG_ID, CONFIG_ID).read();
    });

    const parsed = businessConfigSchema.safeParse(read.resource || {});
    const current = parsed.success ? parsed.data : createDefaultBusinessConfig();

    const sequenceId = current.invoiceNumbering.nextSequence;
    const invoiceNumber = `${current.invoiceNumbering.prefix}${String(sequenceId).padStart(current.invoiceNumbering.padLength, "0")}`;
    const nextConfig: BusinessConfig = {
      ...current,
      invoiceNumbering: {
        ...current.invoiceNumbering,
        nextSequence: sequenceId + 1,
      },
      updatedAt: nowIso(),
    };

    const etag = typeof (read.resource as { _etag?: string } | undefined)?._etag === "string" ? (read.resource as { _etag?: string })._etag : undefined;

    try {
      if (etag) {
        await container.item(CONFIG_ID, CONFIG_ID).replace(nextConfig, {
          accessCondition: { type: "IfMatch", condition: etag },
        });
      } else {
        await container.items.upsert(nextConfig);
      }
      return { sequenceId, invoiceNumber, config: nextConfig };
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 412) continue;
      throw error;
    }
  }

  throw new Error("Failed to reserve invoice number after retries");
}
