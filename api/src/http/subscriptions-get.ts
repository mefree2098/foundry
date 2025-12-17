import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { subscriberListSchema } from "../types/content.js";
import { getSubscribersContainer } from "../subscribers.js";

async function getSubscriptions(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  try {
    const container = await getSubscribersContainer();
    const { resources } = await container.items.query("SELECT * FROM c").fetchAll();
    const parsed = subscriberListSchema.safeParse(resources);
    if (!parsed.success) {
      context.warn(`Some subscriber records failed validation: ${parsed.error.message}`);
    }
    const data = parsed.success ? parsed.data : resources;
    return { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
  } catch (err) {
    context.error(err);
    return { status: 500, body: "Failed to fetch subscribers" };
  }
}

app.http("subscriptions-get", {
  methods: ["GET"],
  route: "subscriptions",
  handler: getSubscriptions,
});
