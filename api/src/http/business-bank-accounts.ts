import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { recordBusinessAuditEvent } from "../business/audit.js";
import { listBankAccounts, upsertBankAccount } from "../business/banking.js";

async function getBankAccounts(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const accounts = await listBankAccounts();
  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(accounts),
  };
}

async function postBankAccount(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const payload = await req.json();
  try {
    const account = await upsertBankAccount(payload);

    await recordBusinessAuditEvent(req, {
      source: "ui",
      actionType: "business.bank.account.upsert",
      entityRef: { type: "bank-account", id: account.id },
      after: account,
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(account),
    };
  } catch (error) {
    return { status: 400, body: error instanceof Error ? error.message : "Failed to save bank account" };
  }
}

app.http("business-bank-accounts-get", {
  methods: ["GET"],
  route: "business/bank/accounts",
  handler: getBankAccounts,
});

app.http("business-bank-accounts-post", {
  methods: ["POST", "PUT"],
  route: "business/bank/accounts/{id?}",
  handler: postBankAccount,
});
