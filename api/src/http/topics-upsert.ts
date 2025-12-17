import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { topicSchema } from "../types/content.js";

async function upsertTopic(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const payload = await req.json();
  const parsed = topicSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 400, body: JSON.stringify(parsed.error.flatten()) };
  }
  const topic = parsed.data;
  const container = database.container(containers.topics);
  await container.items.upsert(topic);
  context.log(`Upserted topic ${topic.id}`);
  return { status: 200, body: JSON.stringify(topic) };
}

async function deleteTopic(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const id = req.params["id"] || req.url.split("/").pop() || "";
  if (!id) return { status: 400, body: "Missing id" };
  const container = database.container(containers.topics);
  await container.item(id, id).delete();
  return { status: 204 };
}

app.http("topics-upsert", {
  methods: ["POST", "PUT"],
  route: "topics/{id?}",
  handler: upsertTopic,
});

app.http("topics-delete", {
  methods: ["DELETE"],
  route: "topics/{id}",
  handler: deleteTopic,
});

