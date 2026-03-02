import { createHmac } from "node:crypto";
import { businessAiActionSchema, type BusinessAiAction } from "./schemas.js";
import { hashPayload, makeEntityId } from "./utils.js";

const confirmSecret = process.env.BUSINESS_CONFIRM_SECRET || process.env.OPENAI_API_KEY || "local-dev-confirm-secret";

type AssistantMode = "safe" | "simulation" | "live";

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function createConfirmToken(userId: string, payloadHash: string, expiresAtIso: string) {
  const payload = JSON.stringify({ userId, payloadHash, expiresAtIso });
  const signature = createHmac("sha256", confirmSecret).update(payload).digest("hex");
  return `${base64UrlEncode(payload)}.${signature}`;
}

export function verifyConfirmToken(token: string, userId: string, payloadHash: string) {
  const [encodedPayload, providedSig] = token.split(".");
  if (!encodedPayload || !providedSig) return false;

  let payloadText = "";
  try {
    payloadText = base64UrlDecode(encodedPayload);
  } catch {
    return false;
  }

  const expectedSig = createHmac("sha256", confirmSecret).update(payloadText).digest("hex");
  if (expectedSig !== providedSig) return false;

  try {
    const payload = JSON.parse(payloadText) as { userId: string; payloadHash: string; expiresAtIso: string };
    if (payload.userId !== userId) return false;
    if (payload.payloadHash !== payloadHash) return false;
    if (new Date(payload.expiresAtIso).getTime() < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

function buildAction(args: {
  type: BusinessAiAction["type"];
  payload: Record<string, unknown>;
  reason: string;
  simulation: boolean;
  confirmToken?: string;
}): BusinessAiAction {
  const id = makeEntityId("act");
  const idempotencyKey = hashPayload([id, args.type, args.payload]).slice(0, 24);
  return businessAiActionSchema.parse({
    id,
    type: args.type,
    payload: args.payload,
    reason: args.reason,
    simulation: args.simulation,
    idempotencyKey,
    confirmToken: args.confirmToken,
  });
}

export function planBusinessActions(options: {
  userId: string;
  mode: AssistantMode;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const lastUserMessage = [...options.messages].reverse().find((message) => message.role === "user")?.content || "";
  const prompt = lastUserMessage.toLowerCase();
  const simulation = options.mode !== "live";

  const actions: BusinessAiAction[] = [];
  let assistantMessage = "I can help with invoices, payments, reports, and reconciliation. I drafted actions where I could infer intent.";

  if (prompt.includes("create invoice") || prompt.includes("new invoice")) {
    actions.push(
      buildAction({
        type: "invoice_create_draft",
        simulation,
        reason: "User requested invoice creation",
        payload: {
          customerId: "replace-customer-id",
          lines: [{ description: "Service", quantity: 1, unitPriceMinor: 10000 }],
        },
      }),
    );
    assistantMessage = "Prepared an invoice draft action. Review customer, lines, and totals before applying.";
  }

  if (prompt.includes("issue invoice") || prompt.includes("send invoice")) {
    actions.push(
      buildAction({
        type: prompt.includes("send invoice") ? "invoice_send_email" : "invoice_issue",
        simulation,
        reason: "User requested invoice issue/send workflow",
        payload: {
          invoiceId: "replace-invoice-id",
        },
      }),
    );
    assistantMessage = "Prepared invoice issue/send action. Confirm invoice ID and recipients before applying.";
  }

  if (prompt.includes("record payment") || prompt.includes("payment")) {
    actions.push(
      buildAction({
        type: "payment_record",
        simulation,
        reason: "User requested payment recording",
        payload: {
          invoiceId: "replace-invoice-id",
          amountMinor: 10000,
          method: "ach",
        },
      }),
    );
    assistantMessage = "Prepared payment recording action. Verify invoice and amount before applying.";
  }

  if (prompt.includes("refund")) {
    actions.push(
      buildAction({
        type: "payment_refund",
        simulation,
        reason: "User requested refund",
        payload: {
          invoiceId: "replace-invoice-id",
          amountMinor: 1000,
          method: "ach",
        },
      }),
    );
    assistantMessage = "Prepared refund action in simulation mode for review.";
  }

  if (prompt.includes("write off") || prompt.includes("write-off")) {
    actions.push(
      buildAction({
        type: "payment_writeoff",
        simulation,
        reason: "User requested write-off",
        payload: {
          invoiceId: "replace-invoice-id",
          amountMinor: 1000,
        },
      }),
    );
    assistantMessage = "Prepared write-off action in simulation mode for review.";
  }

  if (prompt.includes("reconcile")) {
    actions.push(
      buildAction({
        type: "bank_reconcile_run",
        simulation,
        reason: "User requested reconciliation",
        payload: {
          bankAccountId: "replace-bank-account-id",
        },
      }),
    );
    assistantMessage = "Prepared reconciliation run action.";
  }

  if (prompt.includes("report") || prompt.includes("p&l") || prompt.includes("profit")) {
    actions.push(
      buildAction({
        type: "report_generate",
        simulation,
        reason: "User requested reporting",
        payload: {
          reportType: prompt.includes("balance") ? "balance-sheet" : "pnl",
        },
      }),
    );
    assistantMessage = "Prepared report generation action.";
  }

  const payloadHash = hashPayload([options.userId, options.mode, actions]);
  const confirmToken = createConfirmToken(options.userId, payloadHash, new Date(Date.now() + 5 * 60 * 1000).toISOString());

  return {
    assistantMessage,
    mode: options.mode,
    proposedActions: actions,
    confirmToken,
    payloadHash,
  };
}

export function hashActionBatch(userId: string, actions: BusinessAiAction[]) {
  return hashPayload([userId, actions]);
}
