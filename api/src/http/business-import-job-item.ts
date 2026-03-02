import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { getImportJobById } from "../business/imports.js";

async function getBusinessImportJob(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const id = decodeURIComponent((req.params["id"] || "").trim());
  if (!id) return { status: 400, body: "Missing id" };

  const job = await getImportJobById(id);
  if (!job) return { status: 404, body: "Import job not found" };

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
  };
}

app.http("business-import-job-item-get", {
  methods: ["GET"],
  route: "business/imports/jobs/{id}",
  handler: getBusinessImportJob,
});
