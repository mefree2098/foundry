import { database } from "./client.js";
import { containers } from "./cosmos.js";

export type EmailStats = {
  id: string;
  totalSent: number;
  totalFailed: number;
  totalCampaigns: number;
  lastSentAt?: string;
  lastError?: string;
};

const STATS_ID = "email-stats";

export async function getEmailStats(): Promise<EmailStats> {
  try {
    const { resource } = await database.container(containers.config).item(STATS_ID, STATS_ID).read<EmailStats>();
    if (resource) return resource;
  } catch {
    // ignore missing
  }
  return { id: STATS_ID, totalSent: 0, totalFailed: 0, totalCampaigns: 0 };
}

export async function updateEmailStats(delta: Partial<EmailStats>) {
  const existing = await getEmailStats();
  const next: EmailStats = {
    ...existing,
    ...delta,
    totalSent: (existing.totalSent || 0) + (delta.totalSent || 0),
    totalFailed: (existing.totalFailed || 0) + (delta.totalFailed || 0),
    totalCampaigns: (existing.totalCampaigns || 0) + (delta.totalCampaigns || 0),
    lastError: delta.lastError ?? existing.lastError,
  };
  await database.container(containers.config).items.upsert(next);
  return next;
}
