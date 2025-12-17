import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSubscribersContainer } from "../subscribers.js";
import { subscriberSchema } from "../types/content.js";

const signupSchema = z.object({
  email: z.string().email(),
  subscribeAll: z.boolean().optional(),
  platformIds: z.array(z.string()).optional(),
});

function dedupe<T>(items: T[] = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function handleSubscribe(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const payload = await req.json();
    const parsed = signupSchema.safeParse(payload);
    if (!parsed.success) {
      return { status: 400, body: JSON.stringify(parsed.error.flatten()) };
    }

    const email = normalizeEmail(parsed.data.email);
    const subscribeAll = parsed.data.subscribeAll ?? true;
    const platformIds = dedupe(parsed.data.platformIds || []);

    const container = await getSubscribersContainer();
    const existing = await container
      .item(email, email)
      .read<z.infer<typeof subscriberSchema>>()
      .catch(() => ({ resource: undefined }));

    const now = new Date().toISOString();
    const record = {
      id: email,
      email,
      subscribeAll,
      platformIds,
      status: "active" as const,
      mailerLiteId: existing.resource?.mailerLiteId,
      unsubscribeToken: existing.resource?.unsubscribeToken || randomUUID(),
      createdAt: existing.resource?.createdAt || now,
      updatedAt: now,
    };

    await container.items.upsert(record);
    context.log(`Subscribed ${email} with platforms=${platformIds.join(",") || "none"} all=${subscribeAll}`);

    return { status: existing.resource ? 200 : 201, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    context.error(err);
    const message = err instanceof Error ? err.message : "Failed to subscribe";
    return { status: 500, body: message };
  }
}

app.http("subscriptions-upsert", {
  methods: ["POST"],
  route: "subscriptions",
  handler: handleSubscribe,
});
