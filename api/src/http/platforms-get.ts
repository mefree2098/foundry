import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { platformSchema } from "../types/content.js";

async function getPlatforms(_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const container = database.container(containers.platforms);
    const { resources } = await container.items.query("SELECT * FROM c").fetchAll();
    const parsed = resources.map((item) => platformSchema.safeParse(item));

    const errors = parsed.filter((r) => !r.success).length;
    if (errors > 0) {
      context.warn(`Found ${errors} platform items failing validation`);
    }

    const data = parsed
      .filter((r): r is { success: true; data: ReturnType<typeof platformSchema.parse> } => r.success)
      .map((r) => r.data);

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch platforms";
    context.error(err);
    return { status: 500, body: message };
  }
}

app.http("platforms-get", {
  methods: ["GET"],
  route: "platforms",
  handler: getPlatforms,
});

