import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin, getClientPrincipal } from "../auth.js";
import { recordBusinessAuditEvent } from "../business/audit.js";
import { getBusinessConfig, saveBusinessConfig } from "../business/config.js";
import { businessConfigInputSchema, businessConfigSchema } from "../business/schemas.js";

async function upsertBusinessConfig(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const payload = await req.json();
  const parsedInput = businessConfigInputSchema.safeParse(payload);
  if (!parsedInput.success) {
    return { status: 400, body: JSON.stringify(parsedInput.error.flatten()) };
  }

  const principal = getClientPrincipal(req);
  const before = await getBusinessConfig();

  const now = new Date().toISOString();
  const next = businessConfigSchema.parse({
    ...before,
    ...parsedInput.data,
    invoiceNumbering: {
      ...(before.invoiceNumbering || {}),
      ...(parsedInput.data.invoiceNumbering || {}),
    },
    id: "global",
    pk: "global",
    createdAt: before.createdAt || now,
    updatedAt: now,
    updatedBy: principal?.userDetails || principal?.userId,
  });

  await saveBusinessConfig(next);

  await recordBusinessAuditEvent(req, {
    source: "ui",
    actionType: "business.config.upsert",
    entityRef: { type: "business-config", id: "global" },
    before,
    after: next,
  });

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(next),
  };
}

app.http("business-config-upsert", {
  methods: ["POST", "PUT"],
  route: "business/config",
  handler: upsertBusinessConfig,
});
