import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { recordBusinessAuditEvent } from "../business/audit.js";
import { businessCustomerInputSchema, businessCustomerSchema, type BusinessCustomer } from "../business/schemas.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";

async function upsertBusinessCustomer(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const payload = await req.json();
  const parsedInput = businessCustomerInputSchema.safeParse(payload);
  if (!parsedInput.success) {
    return { status: 400, body: JSON.stringify(parsedInput.error.flatten()) };
  }

  const container = database.container(containers.businessCustomers);
  const id = parsedInput.data.id.trim().toLowerCase();

  let before: BusinessCustomer | undefined;
  const { resources } = await container.items
    .query({
      query: "SELECT TOP 1 * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: id }],
    })
    .fetchAll();

  if (resources[0]) {
    const parsedBefore = businessCustomerSchema.safeParse(resources[0]);
    if (parsedBefore.success) before = parsedBefore.data;
  }

  const now = new Date().toISOString();
  const next = businessCustomerSchema.parse({
    ...before,
    ...parsedInput.data,
    id,
    pk: id,
    emails: (parsedInput.data.emails || before?.emails || []).map((entry) => entry.trim()).filter(Boolean),
    defaultTermsDays: parsedInput.data.defaultTermsDays ?? before?.defaultTermsDays ?? 30,
    preferredCurrency: parsedInput.data.preferredCurrency ?? before?.preferredCurrency ?? "USD",
    status: parsedInput.data.status ?? before?.status ?? "active",
    createdAt: before?.createdAt || now,
    updatedAt: now,
  });

  await container.items.upsert(next);

  await recordBusinessAuditEvent(req, {
    source: "ui",
    actionType: "business.customer.upsert",
    entityRef: { type: "customer", id },
    before,
    after: next,
  });

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(next),
  };
}

app.http("business-customers-upsert", {
  methods: ["POST", "PUT"],
  route: "business/customers/{id?}",
  handler: upsertBusinessCustomer,
});
