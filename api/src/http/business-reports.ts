import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { generateBusinessReport } from "../business/reports.js";

async function getBusinessReport(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const reportType = (req.params["reportType"] || "").trim();
  if (!reportType) return { status: 400, body: "Missing reportType" };

  const url = new URL(req.url);
  const fromDate = url.searchParams.get("fromDate") || undefined;
  const toDate = url.searchParams.get("toDate") || undefined;
  const asOfDate = url.searchParams.get("asOfDate") || undefined;

  try {
    const report = await generateBusinessReport(reportType, { fromDate, toDate, asOfDate });
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    };
  } catch (error) {
    return { status: 400, body: error instanceof Error ? error.message : "Failed to generate report" };
  }
}

async function postBusinessReport(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const reportType = (req.params["reportType"] || "").trim();
  if (!reportType) return { status: 400, body: "Missing reportType" };

  const payload = (await req.json().catch(() => ({}))) as { fromDate?: string; toDate?: string; asOfDate?: string };

  try {
    const report = await generateBusinessReport(reportType, payload);
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    };
  } catch (error) {
    return { status: 400, body: error instanceof Error ? error.message : "Failed to generate report" };
  }
}

app.http("business-reports-get", {
  methods: ["GET"],
  route: "business/reports/{reportType}",
  handler: getBusinessReport,
});

app.http("business-reports-post", {
  methods: ["POST"],
  route: "business/reports/{reportType}",
  handler: postBusinessReport,
});
