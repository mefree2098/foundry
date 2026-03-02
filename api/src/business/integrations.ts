import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { HttpRequest } from "@azure/functions";
import { getClientPrincipal } from "../auth.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { importSourceSchema, integrationConnectionInputSchema, integrationConnectionSchema, type ImportSource, type IntegrationConnection } from "./schemas.js";
import { makeEntityId, nowIso } from "./utils.js";

type IntegrationConnectionSummary = Omit<IntegrationConnection, "secretEnvelope">;
type IntegrationSecrets = Record<string, string>;

type ProviderValidation = {
  requiredConfig?: string[];
  requiredSecrets?: string[];
  oneOfSecretGroups?: string[][];
};

const providerValidation: Record<IntegrationConnection["provider"], ProviderValidation> = {
  plaid: {
    requiredConfig: ["environment", "institutionId"],
    requiredSecrets: ["clientId", "secret"],
  },
  "mountain-america-ofx": {
    requiredConfig: ["endpoint"],
    requiredSecrets: ["username", "password"],
  },
  steam: {
    requiredConfig: ["partnerId"],
    requiredSecrets: ["financialWebApiKey"],
  },
  apple: {
    requiredConfig: ["issuerId", "keyId", "vendorNumber"],
    requiredSecrets: ["privateKeyPem"],
  },
  googleplay: {
    requiredConfig: ["bucketUri"],
    requiredSecrets: ["serviceAccountJson"],
  },
  distrokid: {
    requiredConfig: ["accountEmail", "mode"],
  },
};

const sourceIntegrationAllowlist: Partial<Record<ImportSource["type"], IntegrationConnection["provider"][]>> = {
  steam: ["steam"],
  apple: ["apple"],
  googleplay: ["googleplay"],
  distrokid: ["distrokid"],
  "bank-ofx": ["mountain-america-ofx"],
};

const bankFeedAllowlist: Record<"manual" | "plaid" | "ofx", IntegrationConnection["provider"][]> = {
  manual: [],
  plaid: ["plaid"],
  ofx: ["mountain-america-ofx"],
};

function resolveIntegrationEncryptionKey(): Buffer {
  const configured = String(process.env.BUSINESS_INTEGRATION_ENCRYPTION_KEY || "").trim();
  if (configured) {
    if (/^[0-9a-f]{64}$/i.test(configured)) {
      return Buffer.from(configured, "hex");
    }
    const maybeBase64 = configured.startsWith("base64:") ? configured.slice("base64:".length) : configured;
    try {
      const decoded = Buffer.from(maybeBase64, "base64");
      if (decoded.length === 32) {
        return decoded;
      }
    } catch {
      // Fall through to hash-based derivation.
    }
    return createHash("sha256").update(configured).digest();
  }

  const fallback = process.env.BUSINESS_CONFIRM_SECRET || process.env.OPENAI_API_KEY || "local-dev-integration-encryption";
  return createHash("sha256").update(fallback).digest();
}

const integrationEncryptionKey = resolveIntegrationEncryptionKey();
const integrationEncryptionKeyId = createHash("sha256").update(integrationEncryptionKey).digest("hex").slice(0, 16);

function sanitizeSecretInput(input: Record<string, string> | undefined): IntegrationSecrets | undefined {
  if (!input) return undefined;

  const entries = Object.entries(input)
    .map(([key, value]) => [key.trim(), value] as const)
    .filter(([key, value]) => key.length > 0 && typeof value === "string" && value.length > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  if (!entries.length) return undefined;
  return Object.fromEntries(entries);
}

function encryptSecrets(secrets: IntegrationSecrets): NonNullable<IntegrationConnection["secretEnvelope"]> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", integrationEncryptionKey, iv);
  const plaintext = Buffer.from(JSON.stringify(secrets), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    algorithm: "aes-256-gcm",
    keyId: integrationEncryptionKeyId,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    updatedAt: nowIso(),
  };
}

function decryptSecrets(connection: IntegrationConnection): IntegrationSecrets {
  if (!connection.secretEnvelope) return {};

  const iv = Buffer.from(connection.secretEnvelope.iv, "base64");
  const authTag = Buffer.from(connection.secretEnvelope.authTag, "base64");
  const ciphertext = Buffer.from(connection.secretEnvelope.ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", integrationEncryptionKey, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  const parsed = JSON.parse(plaintext) as unknown;
  if (!parsed || typeof parsed !== "object") return {};

  const result: IntegrationSecrets = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

function summarizeConnection(connection: IntegrationConnection): IntegrationConnectionSummary {
  const { secretEnvelope: _secretEnvelope, ...summary } = connection;
  return summary;
}

function validateProviderConfiguration(provider: IntegrationConnection["provider"], config: Record<string, unknown>, secrets: IntegrationSecrets) {
  const rules = providerValidation[provider];
  const missingConfig = (rules.requiredConfig || []).filter((key) => {
    const value = config[key];
    return value == null || String(value).trim().length === 0;
  });

  const missingSecrets = (rules.requiredSecrets || []).filter((key) => !secrets[key] || !String(secrets[key]).trim());

  const unmetSecretGroups = (rules.oneOfSecretGroups || []).filter((group) => !group.some((key) => secrets[key] && String(secrets[key]).trim()));

  if (provider === "plaid") {
    const environment = String(config.environment || "").toLowerCase();
    if (!["sandbox", "development", "production"].includes(environment)) {
      missingConfig.push("environment=sandbox|development|production");
    }
  }

  if (provider === "googleplay" && secrets.serviceAccountJson) {
    try {
      const parsed = JSON.parse(secrets.serviceAccountJson) as Record<string, unknown>;
      if (!parsed.client_email || !parsed.private_key) {
        missingSecrets.push("serviceAccountJson(client_email/private_key)");
      }
    } catch {
      missingSecrets.push("serviceAccountJson(valid JSON)");
    }
  }

  if (provider === "apple" && secrets.privateKeyPem && !String(secrets.privateKeyPem).includes("BEGIN")) {
    missingSecrets.push("privateKeyPem(PEM format)");
  }

  if (provider === "distrokid") {
    const mode = String(config.mode || "").toLowerCase();
    if (!["manual_csv", "automated"].includes(mode)) {
      missingConfig.push("mode=manual_csv|automated");
    }
    if (mode === "automated") {
      const hasSessionFlow = Boolean(secrets.sessionCookie && secrets.csvExportToken);
      const hasApiToken = Boolean(secrets.apiToken);
      if (!hasSessionFlow && !hasApiToken) {
        missingSecrets.push("sessionCookie+csvExportToken or apiToken");
      }
    }
  }

  if (!missingConfig.length && !missingSecrets.length && !unmetSecretGroups.length) {
    return { ok: true, message: "Configuration looks valid." };
  }

  const reasons: string[] = [];
  if (missingConfig.length) reasons.push(`missing config: ${missingConfig.join(", ")}`);
  if (missingSecrets.length) reasons.push(`missing secrets: ${missingSecrets.join(", ")}`);
  if (unmetSecretGroups.length) reasons.push("missing required secret option set");
  return { ok: false, message: reasons.join("; ") };
}

async function getConnectionByIdInternal(id: string): Promise<IntegrationConnection | null> {
  const normalized = id.trim().toLowerCase();
  if (!normalized) return null;

  const container = database.container(containers.businessIntegrations);
  const { resources } = await container.items
    .query({
      query: "SELECT TOP 1 * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: normalized }],
    })
    .fetchAll();

  if (!resources[0]) return null;
  const parsed = integrationConnectionSchema.safeParse(resources[0]);
  return parsed.success ? parsed.data : null;
}

export async function getIntegrationConnectionById(id: string): Promise<IntegrationConnectionSummary | null> {
  const connection = await getConnectionByIdInternal(id);
  return connection ? summarizeConnection(connection) : null;
}

export async function listIntegrationConnections(): Promise<IntegrationConnectionSummary[]> {
  const container = database.container(containers.businessIntegrations);
  const { resources } = await container.items.query("SELECT * FROM c ORDER BY c.updatedAt DESC").fetchAll();
  return resources
    .map((resource) => integrationConnectionSchema.safeParse(resource))
    .filter((parsed) => parsed.success)
    .map((parsed) => summarizeConnection(parsed.data));
}

export async function upsertIntegrationConnection(req: HttpRequest, payload: unknown): Promise<IntegrationConnectionSummary> {
  const parsedInput = integrationConnectionInputSchema.parse(payload);
  const id = (parsedInput.id || makeEntityId("integration")).toLowerCase();
  const existing = await getConnectionByIdInternal(id);

  const providerChanged = !!existing && existing.provider !== parsedInput.provider;
  const existingSecrets = existing && !providerChanged ? decryptSecrets(existing) : {};
  const incomingSecrets = sanitizeSecretInput(parsedInput.secrets);
  const mergedSecrets = incomingSecrets ? { ...existingSecrets, ...incomingSecrets } : existingSecrets;

  const secretEnvelope = Object.keys(mergedSecrets).length ? encryptSecrets(mergedSecrets) : undefined;
  const secretMeta = {
    keyCount: Object.keys(mergedSecrets).length,
    keys: Object.keys(mergedSecrets).sort(),
    updatedAt: secretEnvelope?.updatedAt || existing?.secretMeta.updatedAt,
  };

  const state = parsedInput.state || existing?.state || "active";
  const status = state === "disabled" ? "disabled" : "not_tested";
  const statusMessage = state === "disabled" ? "Integration disabled." : "Saved. Run Test connection before import jobs.";

  const principal = getClientPrincipal(req);
  const connection = integrationConnectionSchema.parse({
    ...existing,
    id,
    pk: id,
    provider: parsedInput.provider,
    displayName: parsedInput.displayName,
    config: parsedInput.config || existing?.config || {},
    state,
    status,
    statusMessage,
    lastTestedAt: state === "disabled" ? nowIso() : undefined,
    secretMeta,
    secretEnvelope,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    updatedBy: principal?.userDetails || principal?.userId,
  });

  const container = database.container(containers.businessIntegrations);
  await container.items.upsert(connection);
  return summarizeConnection(connection);
}

export async function testIntegrationConnection(id: string): Promise<IntegrationConnectionSummary> {
  const existing = await getConnectionByIdInternal(id);
  if (!existing) {
    throw new Error(`Integration ${id} not found`);
  }

  const checkedAt = nowIso();
  if (existing.state === "disabled") {
    const disabled = integrationConnectionSchema.parse({
      ...existing,
      status: "disabled",
      statusMessage: "Integration disabled.",
      lastTestedAt: checkedAt,
      updatedAt: checkedAt,
    });
    const container = database.container(containers.businessIntegrations);
    await container.items.upsert(disabled);
    return summarizeConnection(disabled);
  }

  let secrets: IntegrationSecrets = {};
  try {
    secrets = decryptSecrets(existing);
  } catch {
    const failed = integrationConnectionSchema.parse({
      ...existing,
      status: "needs_attention",
      statusMessage: "Unable to decrypt stored credentials. Re-enter secrets.",
      lastTestedAt: checkedAt,
      updatedAt: checkedAt,
    });
    const container = database.container(containers.businessIntegrations);
    await container.items.upsert(failed);
    return summarizeConnection(failed);
  }

  const result = validateProviderConfiguration(existing.provider, existing.config, secrets);
  const tested = integrationConnectionSchema.parse({
    ...existing,
    status: result.ok ? "connected" : "needs_attention",
    statusMessage: result.ok ? "Connection validated from saved credentials." : result.message,
    lastTestedAt: checkedAt,
    updatedAt: checkedAt,
  });

  const container = database.container(containers.businessIntegrations);
  await container.items.upsert(tested);
  return summarizeConnection(tested);
}

export async function deleteIntegrationConnection(id: string): Promise<boolean> {
  const existing = await getConnectionByIdInternal(id);
  if (!existing) return false;

  const container = database.container(containers.businessIntegrations);
  await container.item(existing.id, existing.pk).delete();
  return true;
}

export async function assertSourceIntegrationReady(sourceInput: unknown): Promise<void> {
  const source = importSourceSchema.parse(sourceInput);
  if (source.state === "disabled") return;

  const allowed = sourceIntegrationAllowlist[source.type];
  if (!allowed || !allowed.length) return;

  if (!source.integrationId) {
    throw new Error(`Import source type ${source.type} requires an integration profile.`);
  }

  const integration = await getConnectionByIdInternal(source.integrationId);
  if (!integration) {
    throw new Error(`Integration ${source.integrationId} not found.`);
  }
  if (integration.state !== "active") {
    throw new Error(`Integration ${source.integrationId} is disabled.`);
  }
  if (!allowed.includes(integration.provider)) {
    throw new Error(`Integration provider ${integration.provider} is not valid for source type ${source.type}.`);
  }
  if (integration.status !== "connected") {
    throw new Error(`Integration ${source.integrationId} must pass Test connection before running jobs.`);
  }
}

export async function assertBankFeedIntegrationReady(feedType: "manual" | "plaid" | "ofx", integrationId: string | undefined): Promise<void> {
  const allowed = bankFeedAllowlist[feedType];
  if (!allowed.length) return;

  if (!integrationId) {
    throw new Error(`Bank feed type ${feedType} requires an integration profile.`);
  }

  const integration = await getConnectionByIdInternal(integrationId);
  if (!integration) {
    throw new Error(`Integration ${integrationId} not found.`);
  }
  if (integration.state !== "active") {
    throw new Error(`Integration ${integrationId} is disabled.`);
  }
  if (!allowed.includes(integration.provider)) {
    throw new Error(`Integration provider ${integration.provider} is not valid for bank feed ${feedType}.`);
  }
  if (integration.status !== "connected") {
    throw new Error(`Integration ${integrationId} must pass Test connection before being used as a bank feed.`);
  }
}
