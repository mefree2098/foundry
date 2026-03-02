import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { businessAuditEventSchema } from "../business/schemas.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";

function clampLimit(rawLimit: string | null) {
  const parsed = Number(rawLimit || "25");
  if (!Number.isFinite(parsed)) return 25;
  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

async function getBusinessAudit(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get("limit"));
  const cursor = url.searchParams.get("cursor") || undefined;

  const container = database.container(containers.businessAuditEvents);
  const query = cursor
    ? {
        query: `SELECT TOP ${limit} * FROM c WHERE c.timestamp < @cursor ORDER BY c.timestamp DESC`,
        parameters: [{ name: "@cursor", value: cursor }],
      }
    : `SELECT TOP ${limit} * FROM c ORDER BY c.timestamp DESC`;

  try {
    const { resources } = await container.items.query(query).fetchAll();
    const parsed = resources.map((item) => businessAuditEventSchema.safeParse(item));
    const invalidCount = parsed.filter((item) => !item.success).length;
    if (invalidCount) {
      context.warn(`Found ${invalidCount} audit events failing schema validation`);
    }

    const items = parsed.filter((item): item is { success: true; data: ReturnType<typeof businessAuditEventSchema.parse> } => item.success).map((item) => item.data);
    const nextCursor = items.length ? items[items.length - 1].timestamp : undefined;

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, cursor: nextCursor }),
    };
  } catch (err) {
    context.error(err);
    return { status: 500, body: "Failed to fetch business audit events" };
  }
}

app.http("business-audit-get", {
  methods: ["GET"],
  route: "business/audit",
  handler: getBusinessAudit,
});
