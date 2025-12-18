import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { platformSchema } from "../types/content.js";
import { ensureNoNews } from "./guards.js";

async function upsertPlatform(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  try {
    const payload = await req.json();
    const parsed = platformSchema.safeParse(payload);
    if (!parsed.success) {
      return { status: 400, body: JSON.stringify(parsed.error.flatten()) };
    }
    const platform = parsed.data;
    const container = database.container(containers.platforms);

    await container.items.upsert(platform);
    context.log(`Upserted platform ${platform.id}`);

    return { status: 200, body: JSON.stringify(platform) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save platform";
    context.error(err);
    return { status: 500, body: message };
  }
}

async function deletePlatform(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const id = req.params["id"] || req.url.split("/").pop() || "";
  if (!id) return { status: 400, body: "Missing id" };
  const container = database.container(containers.platforms);
  const newsContainer = database.container(containers.news);

  const canDelete = await ensureNoNews(newsContainer, id);
  if (!canDelete) {
    return { status: 409, body: "Cannot delete platform with existing news references. Remove related news first." };
  }

  await container.item(id, id).delete();
  return { status: 204 };
}

app.http("platforms-upsert", {
  methods: ["POST", "PUT"],
  route: "platforms/{id?}",
  handler: upsertPlatform,
});

app.http("platforms-delete", {
  methods: ["DELETE"],
  route: "platforms/{id}",
  handler: deletePlatform,
});

