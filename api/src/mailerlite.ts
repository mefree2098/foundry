const BASE_URL = "https://connect.mailerlite.com/api";

let overrideApiKey: string | null = null;

export function setMailerLiteApiKey(key?: string) {
  overrideApiKey = key || null;
}

function getApiKey() {
  const key = overrideApiKey || process.env.MAILERLITE_API_KEY;
  if (!key) throw new Error("Missing MailerLite API key (set env MAILERLITE_API_KEY or emailSettings.mailerLiteApiKey)");
  return key;
}

async function mlFetch<T>(path: string, init: RequestInit): Promise<T> {
  const apiKey = getApiKey();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MailerLite ${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) {
    return {} as T;
  }
  const data = (await res.json()) as T;
  return data;
}

export async function ensureGroup(name: string, existingId?: string): Promise<string> {
  if (existingId) return existingId;
  const body = { name };
  const result = await mlFetch<{ data: { id: string } }>("/groups", { method: "POST", body: JSON.stringify(body) });
  return result.data.id;
}

export async function upsertSubscriber(email: string, groups?: string[]): Promise<{ id: string }> {
  const payload = { email, groups, resubscribe: true };
  const result = await mlFetch<{ data: { id: string } }>("/subscribers", { method: "POST", body: JSON.stringify(payload) });
  return result.data;
}

export async function updateSubscriberStatus(idOrEmail: string, status: "active" | "unsubscribed") {
  const body = { status };
  await mlFetch(`/subscribers/${encodeURIComponent(idOrEmail)}`, { method: "PUT", body: JSON.stringify(body) });
}

export async function forgetSubscriber(idOrEmail: string) {
  // Attempt GDPR forget first; fall back to delete if needed.
  try {
    await mlFetch(`/subscribers/${encodeURIComponent(idOrEmail)}/forget`, { method: "POST", body: JSON.stringify({}) });
  } catch {
    // If forget not allowed, try delete (removes from account but keeps minimal info)
    try {
      await mlFetch(`/subscribers/${encodeURIComponent(idOrEmail)}`, { method: "DELETE" });
    } catch (err2) {
      throw err2 instanceof Error ? err2 : new Error(String(err2));
    }
  }
}

export async function importSubscribersToGroup(groupId: string, emails: string[]) {
  if (emails.length === 0) return;
  const subscribers = emails.map((email) => ({ email }));
  await mlFetch(`/groups/${groupId}/import-subscribers`, { method: "POST", body: JSON.stringify({ subscribers }) });
}

export async function deleteGroup(groupId: string) {
  await mlFetch(`/groups/${groupId}`, { method: "DELETE" });
}

export type CampaignInput = {
  name: string;
  subject: string;
  content: string;
  fromName: string;
  fromEmail: string;
  groupIds: string[];
  replyTo?: string;
};

export async function createCampaign(input: CampaignInput): Promise<{ id: string }> {
  const { name, subject, content, fromEmail, fromName, groupIds, replyTo } = input;
  const payload = {
    name,
    type: "regular",
    groups: groupIds,
    emails: [
      {
        subject,
        from_name: fromName,
        from: fromEmail,
        reply_to: replyTo,
        content,
      },
    ],
  };
  const result = await mlFetch<{ data: { id: string } }>("/campaigns", { method: "POST", body: JSON.stringify(payload) });
  return result.data;
}

export async function scheduleCampaign(campaignId: string) {
  await mlFetch(`/campaigns/${campaignId}/schedule`, {
    method: "POST",
    body: JSON.stringify({ delivery: "instant" }),
  });
}

export async function fetchSubscriberTotal(): Promise<number> {
  const result = await mlFetch<{ total: number }>("/subscribers?limit=0", { method: "GET" });
  return result.total;
}
