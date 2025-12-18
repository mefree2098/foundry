import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { newsSchema } from "../types/content.js";

async function upsertNews(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  try {
    const payload = await req.json();
    const parsed = newsSchema.safeParse(payload);
    if (!parsed.success) {
      return { status: 400, body: JSON.stringify(parsed.error.flatten()) };
    }
    const news = parsed.data;
    const container = database.container(containers.news);

    await container.items.upsert(news);
    context.log(`Upserted news ${news.id}`);

    return { status: 200, body: JSON.stringify(news) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save news";
    context.error(err);
    return { status: 500, body: message };
  }
}

async function deleteNews(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };
  const id = req.params["id"] || req.url.split("/").pop() || "";
  if (!id) return { status: 400, body: "Missing id" };
  const container = database.container(containers.news);
  await container.item(id, id).delete();
  return { status: 204 };
}

app.http("news-upsert", {
  methods: ["POST", "PUT"],
  route: "news/{id?}",
  handler: upsertNews,
});

app.http("news-delete", {
  methods: ["DELETE"],
  route: "news/{id}",
  handler: deleteNews,
});

