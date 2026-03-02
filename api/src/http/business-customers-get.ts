import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { businessCustomerSchema } from "../business/schemas.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";

async function getBusinessCustomers(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  try {
    const container = database.container(containers.businessCustomers);
    const { resources } = await container.items.query("SELECT * FROM c ORDER BY c.updatedAt DESC").fetchAll();

    const parsed = resources.map((item) => businessCustomerSchema.safeParse(item));
    const invalidCount = parsed.filter((item) => !item.success).length;
    if (invalidCount) {
      context.warn(`Found ${invalidCount} business customer records failing schema validation`);
    }

    const data = parsed.filter((item): item is { success: true; data: ReturnType<typeof businessCustomerSchema.parse> } => item.success).map((item) => item.data);

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    context.error(err);
    return { status: 500, body: "Failed to fetch business customers" };
  }
}

app.http("business-customers-get", {
  methods: ["GET"],
  route: "business/customers",
  handler: getBusinessCustomers,
});
