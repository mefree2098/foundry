import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { recordBusinessAuditEvent } from "../business/audit.js";
import { businessCustomerSchema } from "../business/schemas.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";

async function findCustomer(id: string) {
  const container = database.container(containers.businessCustomers);
  const { resources } = await container.items
    .query({
      query: "SELECT TOP 1 * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: id }],
    })
    .fetchAll();

  return resources[0] as Record<string, unknown> | undefined;
}

async function getBusinessCustomer(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const id = decodeURIComponent((req.params["id"] || "").trim().toLowerCase());
  if (!id) return { status: 400, body: "Missing id" };

  const record = await findCustomer(id);
  if (!record) return { status: 404, body: "Customer not found" };

  const parsed = businessCustomerSchema.safeParse(record);
  if (!parsed.success) return { status: 500, body: "Stored customer record failed validation" };

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  };
}

async function deleteBusinessCustomer(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const id = decodeURIComponent((req.params["id"] || "").trim().toLowerCase());
  if (!id) return { status: 400, body: "Missing id" };

  const record = await findCustomer(id);
  if (!record) return { status: 404, body: "Customer not found" };

  const container = database.container(containers.businessCustomers);
  const partitionKey = typeof record.pk === "string" && record.pk ? record.pk : id;
  await container.item(id, partitionKey).delete();

  const parsedBefore = businessCustomerSchema.safeParse(record);
  await recordBusinessAuditEvent(req, {
    source: "ui",
    actionType: "business.customer.delete",
    entityRef: { type: "customer", id },
    before: parsedBefore.success ? parsedBefore.data : record,
  });

  return { status: 204 };
}

app.http("business-customers-item-get", {
  methods: ["GET"],
  route: "business/customers/{id}",
  handler: getBusinessCustomer,
});

app.http("business-customers-item-delete", {
  methods: ["DELETE"],
  route: "business/customers/{id}",
  handler: deleteBusinessCustomer,
});
