import { database } from "./client.js";
import { containers } from "./cosmos.js";
import type { SiteConfig } from "./types/content.js";

export async function getSiteConfig(): Promise<SiteConfig> {
  try {
    const { resource } = await database.container(containers.config).item("global", "global").read<SiteConfig>();
    if (resource) return resource;
  } catch {
    // ignore and return defaults
  }
  return { id: "global" };
}

export async function saveSiteConfig(config: SiteConfig) {
  const container = database.container(containers.config);
  const id = config.id || "global";
  await container.items.upsert({ ...config, id });
}
