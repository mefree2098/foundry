import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { recordBusinessAuditEvent } from "../business/audit.js";
import { listImportSources, upsertImportSource } from "../business/imports.js";

async function getBusinessImportSources(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const items = await listImportSources();
  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items),
  };
}

async function postBusinessImportSource(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const payload = await req.json();

  try {
    const source = await upsertImportSource(payload);

    await recordBusinessAuditEvent(req, {
      source: "ui",
      actionType: "business.import.source.upsert",
      entityRef: { type: "import-source", id: source.id },
      after: source,
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(source),
    };
  } catch (error) {
    return { status: 400, body: error instanceof Error ? error.message : "Failed to save import source" };
  }
}

app.http("business-import-sources-get", {
  methods: ["GET"],
  route: "business/imports/sources",
  handler: getBusinessImportSources,
});

app.http("business-import-sources-post", {
  methods: ["POST", "PUT"],
  route: "business/imports/sources/{id?}",
  handler: postBusinessImportSource,
});
