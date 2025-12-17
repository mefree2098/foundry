import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSubscribersContainer } from "../subscribers.js";

async function unsubscribe(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const emailFromQuery = req.query.get("email");
    let email = emailFromQuery ? emailFromQuery : "";

    if (!email) {
      try {
        const payload = (await req.json()) as { email?: string };
        email = typeof payload.email === "string" ? payload.email : "";
      } catch {
        // ignore
      }
    }

    if (!email) return { status: 400, body: "Email is required" };
    const normalized = email.trim().toLowerCase();
    const container = await getSubscribersContainer();

    const existing = await container
      .item(normalized, normalized)
      .read<{ id: string; email: string; createdAt?: string }>()
      .catch(() => ({ resource: undefined }));

    if (existing.resource) {
      const now = new Date().toISOString();
      await container.items.upsert({
        ...existing.resource,
        status: "unsubscribed",
        updatedAt: now,
      });
    }

    const body = "You have been unsubscribed. You can re-subscribe any time from the site.";
    return { status: 200, body };
  } catch (err) {
    context.error(err);
    return { status: 500, body: "Failed to unsubscribe" };
  }
}

app.http("subscriptions-unsubscribe", {
  methods: ["GET", "POST"],
  route: "subscriptions/unsubscribe",
  handler: unsubscribe,
});
