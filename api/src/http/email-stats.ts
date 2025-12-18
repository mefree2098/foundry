import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { getSubscribersContainer } from "../subscribers.js";
import { getEmailStats } from "../emailStats.js";
import { subscriberSchema, type Subscriber } from "../types/content.js";

async function getEmailDashboardStats(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  try {
    const container = await getSubscribersContainer();
    const { resources } = await container.items.query("SELECT * FROM c").fetchAll();

    const subscribers: Subscriber[] = [];
    for (const raw of resources) {
      const parsed = subscriberSchema.safeParse(raw);
      if (parsed.success) subscribers.push(parsed.data);
    }

    const active = subscribers.filter((s) => s.status !== "unsubscribed").length;
    const unsubscribed = subscribers.filter((s) => s.status === "unsubscribed").length;

    const stats = await getEmailStats();

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        active,
        unsubscribed,
        total: subscribers.length,
        totalSent: stats.totalSent || 0,
        totalFailed: stats.totalFailed || 0,
        totalCampaigns: stats.totalCampaigns || 0,
        lastSentAt: stats.lastSentAt,
      }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load email stats";
    return { status: 500, body: message };
  }
}

app.http("email-stats", {
  methods: ["GET"],
  route: "email/stats",
  handler: getEmailDashboardStats,
});
