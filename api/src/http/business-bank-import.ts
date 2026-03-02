import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { recordBusinessAuditEvent } from "../business/audit.js";
import { importBankTransactions } from "../business/banking.js";

async function importBusinessBankTransactions(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const payload = await req.json();
  try {
    const result = await importBankTransactions(payload);

    await recordBusinessAuditEvent(req, {
      source: "import",
      actionType: "business.bank.import",
      entityRef: {
        type: "bank-account",
        id: typeof (payload as { bankAccountId?: unknown }).bankAccountId === "string" ? String((payload as { bankAccountId: string }).bankAccountId) : "unknown",
      },
      after: result,
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (error) {
    return { status: 400, body: error instanceof Error ? error.message : "Failed to import bank transactions" };
  }
}

app.http("business-bank-import", {
  methods: ["POST"],
  route: "business/bank/import",
  handler: importBusinessBankTransactions,
});
