import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { listBankTransactions } from "../business/banking.js";

function parseLimit(value: string | null) {
  const parsed = Number(value || "100");
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(Math.trunc(parsed), 1), 300);
}

async function getBankTransactions(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const url = new URL(req.url);
  const bankAccountId = url.searchParams.get("bankAccountId") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const cursor = url.searchParams.get("cursor") || undefined;
  const limit = parseLimit(url.searchParams.get("limit"));

  const data = await listBankTransactions({
    bankAccountId,
    status: status as "unreviewed" | "categorized" | "reconciled" | "ignored" | undefined,
    cursor,
    limit,
  });

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

app.http("business-bank-transactions-get", {
  methods: ["GET"],
  route: "business/bank/transactions",
  handler: getBankTransactions,
});
