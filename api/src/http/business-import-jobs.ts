import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { recordBusinessAuditEvent } from "../business/audit.js";
import { listImportJobs, runImportJob } from "../business/imports.js";

function parseLimit(value: string | null) {
  const parsed = Number(value || "50");
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.trunc(parsed), 1), 200);
}

async function getBusinessImportJobs(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = url.searchParams.get("cursor") || undefined;
  const sourceId = url.searchParams.get("sourceId") || undefined;

  const data = await listImportJobs({ limit, cursor, sourceId });
  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

async function postBusinessImportJob(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const payload = await req.json();

  try {
    const job = await runImportJob(payload);

    await recordBusinessAuditEvent(req, {
      source: "import",
      actionType: "business.import.job.run",
      entityRef: { type: "import-job", id: job.id },
      after: job,
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job),
    };
  } catch (error) {
    return { status: 400, body: error instanceof Error ? error.message : "Failed to run import job" };
  }
}

app.http("business-import-jobs-get", {
  methods: ["GET"],
  route: "business/imports/jobs",
  handler: getBusinessImportJobs,
});

app.http("business-import-jobs-post", {
  methods: ["POST"],
  route: "business/imports/jobs",
  handler: postBusinessImportJob,
});
