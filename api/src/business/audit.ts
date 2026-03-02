import { createHash, randomUUID } from "node:crypto";
import type { HttpRequest } from "@azure/functions";
import { getClientPrincipal } from "../auth.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { businessAuditEventSchema, type BusinessAuditEvent } from "./schemas.js";

type AuditSource = "ui" | "ai" | "import" | "system";

type RecordBusinessAuditEventInput = {
  source?: AuditSource;
  actionType: string;
  entityRef: { type: string; id: string };
  before?: unknown;
  after?: unknown;
  correlationId?: string;
  requestId?: string;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    const result: Record<string, unknown> = {};
    for (const [key, child] of entries) {
      result[key] = canonicalize(child);
    }
    return result;
  }
  return value;
}

function hashEvent(prevHash: string | undefined, eventPayload: unknown) {
  const canonical = JSON.stringify(canonicalize(eventPayload));
  return createHash("sha256").update(`${prevHash || ""}|${canonical}`).digest("hex");
}

async function getLatestHash(): Promise<string | undefined> {
  const container = database.container(containers.businessAuditEvents);
  try {
    const { resources } = await container.items
      .query<{ hash?: string }>("SELECT TOP 1 c.hash FROM c ORDER BY c.timestamp DESC")
      .fetchAll();
    return resources[0]?.hash;
  } catch {
    return undefined;
  }
}

export async function recordBusinessAuditEvent(req: HttpRequest, input: RecordBusinessAuditEventInput): Promise<BusinessAuditEvent> {
  const container = database.container(containers.businessAuditEvents);
  const principal = getClientPrincipal(req);
  const timestamp = new Date().toISOString();
  const dateBucket = timestamp.slice(0, 7);
  const prevHash = await getLatestHash();

  const base = {
    id: randomUUID(),
    timestamp,
    dateBucket,
    source: input.source || "ui",
    actor: {
      userId: principal?.userId,
      userDetails: principal?.userDetails,
      roles: principal?.userRoles || [],
    },
    actionType: input.actionType,
    entityRef: input.entityRef,
    before: input.before,
    after: input.after,
    correlationId: input.correlationId,
    requestId: input.requestId || req.headers.get("x-request-id") || undefined,
    prevHash,
  };

  const hash = hashEvent(prevHash, base);
  const event = businessAuditEventSchema.parse({ ...base, hash });

  await container.items.upsert(event);
  return event;
}
