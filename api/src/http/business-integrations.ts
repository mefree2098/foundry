import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { recordBusinessAuditEvent } from "../business/audit.js";
import { deleteIntegrationConnection, getIntegrationConnectionById, listIntegrationConnections, testIntegrationConnection, upsertIntegrationConnection } from "../business/integrations.js";
import { importSourceSchema } from "../business/schemas.js";

async function getBusinessIntegrations(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const items = await listIntegrationConnections();
  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items),
  };
}

async function postBusinessIntegration(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  try {
    const payload = await req.json();
    const paramsId = String(req.params.id || "").trim().toLowerCase();
    const normalizedPayload = payload && typeof payload === "object" ? ({ ...(payload as Record<string, unknown>) } as Record<string, unknown>) : {};
    if (paramsId && !normalizedPayload.id) {
      normalizedPayload.id = paramsId;
    }

    const before = paramsId ? await getIntegrationConnectionById(paramsId) : null;
    const integration = await upsertIntegrationConnection(req, normalizedPayload);

    await recordBusinessAuditEvent(req, {
      source: "ui",
      actionType: "business.integration.upsert",
      entityRef: { type: "integration", id: integration.id },
      before: before || undefined,
      after: integration,
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(integration),
    };
  } catch (error) {
    return { status: 400, body: error instanceof Error ? error.message : "Failed to save integration" };
  }
}

async function postBusinessIntegrationTest(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const id = String(req.params.id || "").trim().toLowerCase();
  if (!id) return { status: 400, body: "Missing integration id" };

  try {
    const before = await getIntegrationConnectionById(id);
    const integration = await testIntegrationConnection(id);

    await recordBusinessAuditEvent(req, {
      source: "ui",
      actionType: "business.integration.test",
      entityRef: { type: "integration", id },
      before: before || undefined,
      after: integration,
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(integration),
    };
  } catch (error) {
    return { status: 400, body: error instanceof Error ? error.message : "Failed to test integration" };
  }
}

async function deleteBusinessIntegration(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const id = String(req.params.id || "").trim().toLowerCase();
  if (!id) return { status: 400, body: "Missing integration id" };

  const before = await getIntegrationConnectionById(id);
  if (!before) return { status: 404, body: "Integration not found" };

  const sourceContainer = database.container(containers.businessImportSources);
  const { resources } = await sourceContainer.items
    .query({
      query: "SELECT * FROM c WHERE c.integrationId = @integrationId",
      parameters: [{ name: "@integrationId", value: id }],
    })
    .fetchAll();

  const activeSources = resources
    .map((resource) => importSourceSchema.safeParse(resource))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
    .filter((source) => source.state === "active");

  if (activeSources.length > 0) {
    return {
      status: 409,
      body: `Integration is linked to active import sources: ${activeSources.map((source) => source.id).join(", ")}`,
    };
  }

  const deleted = await deleteIntegrationConnection(id);
  if (!deleted) return { status: 404, body: "Integration not found" };

  await recordBusinessAuditEvent(req, {
    source: "ui",
    actionType: "business.integration.delete",
    entityRef: { type: "integration", id },
    before,
  });

  return { status: 204 };
}

app.http("business-integrations-get", {
  methods: ["GET"],
  route: "business/integrations",
  handler: getBusinessIntegrations,
});

app.http("business-integrations-post", {
  methods: ["POST", "PUT"],
  route: "business/integrations/{id?}",
  handler: postBusinessIntegration,
});

app.http("business-integrations-test", {
  methods: ["POST"],
  route: "business/integrations/{id}/test",
  handler: postBusinessIntegrationTest,
});

app.http("business-integrations-delete", {
  methods: ["DELETE"],
  route: "business/integrations/{id}",
  handler: deleteBusinessIntegration,
});
