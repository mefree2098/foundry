import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { newsSchema } from "../types/content.js";

async function getNews(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const platformId = req.query.get("platformId");
    const topic = req.query.get("topic");
    const container = database.container(containers.news);

    let query = "SELECT * FROM c";
    const params: { name: string; value: string }[] = [];
    const filters: string[] = [];

    if (platformId) {
      filters.push("ARRAY_CONTAINS(c.platformIds, @platformId)");
      params.push({ name: "@platformId", value: platformId });
    }
    if (topic) {
      filters.push("ARRAY_CONTAINS(c.topics, @topic)");
      params.push({ name: "@topic", value: topic });
    }
    if (filters.length > 0) {
      query += ` WHERE ${filters.join(" AND ")}`;
    }

    const { resources } = await container.items.query({ query, parameters: params }).fetchAll();
    const parsed = resources.map((item) => newsSchema.safeParse(item));

    const errors = parsed.filter((r) => !r.success).length;
    if (errors > 0) {
      context.warn(`Found ${errors} news items failing validation`);
    }

    const data = parsed.filter((r): r is { success: true; data: ReturnType<typeof newsSchema.parse> } => r.success).map((r) => r.data);

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch news";
    context.error(err);
    return { status: 500, body: message };
  }
}

app.http("news-get", {
  methods: ["GET"],
  route: "news",
  handler: getNews,
});

