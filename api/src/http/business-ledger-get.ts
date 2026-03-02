import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { getBusinessConfig } from "../business/config.js";
import { computeTrialBalance, listAllJournalEntries, listJournalEntries } from "../business/ledger.js";

function parseLimit(value: string | null) {
  const parsed = Number(value || "100");
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(Math.trunc(parsed), 1), 400);
}

async function getBusinessLedger(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = url.searchParams.get("cursor") || undefined;
  const includeTrialBalance = url.searchParams.get("trialBalance") === "1";

  const [page, config, allEntries] = await Promise.all([
    listJournalEntries(limit, cursor),
    getBusinessConfig(),
    includeTrialBalance ? listAllJournalEntries() : Promise.resolve([]),
  ]);

  const trialBalance = includeTrialBalance ? computeTrialBalance(allEntries) : undefined;

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entries: page.items,
      cursor: page.cursor,
      chartOfAccounts: config.chartOfAccounts,
      trialBalance,
    }),
  };
}

app.http("business-ledger-get", {
  methods: ["GET"],
  route: "business/ledger",
  handler: getBusinessLedger,
});
