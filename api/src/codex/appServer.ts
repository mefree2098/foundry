import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { accessSync, constants as fsConstants, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import type { InvocationContext } from "@azure/functions";
import type { Container } from "@azure/cosmos";

const DEFAULT_CODEX_RPC_TIMEOUT_MS = Number(process.env.CODEX_RPC_TIMEOUT_MS || 45000);
const DEFAULT_CODEX_TURN_TIMEOUT_MS = Number(process.env.CODEX_TURN_TIMEOUT_MS || 180000);
const DEFAULT_CODEX_LOGIN_TTL_MS = Number(process.env.CODEX_LOGIN_TTL_MS || 10 * 60 * 1000);
const DEFAULT_CODEX_LOGIN_COMPLETE_TIMEOUT_MS = Number(process.env.CODEX_LOGIN_COMPLETE_TIMEOUT_MS || 30000);
const STDERR_TAIL_MAX = 2000;
const DEFAULT_CODEX_HOME_TMP_DIR = "ntechr-codex-home";
const DEFAULT_CODEX_HOME_AZURE_DIR = "/home/site/.codex";
const CODEX_CONFIG_FILE_NAME = "config.toml";

type JsonRpcId = number | string;

type CodexUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type CodexChatResult = {
  assistantText: string;
  model: string;
  usage?: CodexUsage;
};

export type CodexModelSummary = {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  isDefault: boolean;
  supportsPersonality: boolean;
  defaultReasoningEffort?: string;
  inputModalities: string[];
  supportedReasoningEfforts: string[];
  upgrade?: string;
};

export type RunCodexChatOptions = {
  codexPath: string;
  codexHome?: string;
  model: string;
  cwd?: string;
  developerInstructions: string;
  inputText: string;
  outputSchema?: unknown;
  requestTimeoutMs?: number;
  turnTimeoutMs?: number;
  onDelta?: (delta: string) => void;
  context?: InvocationContext;
};

export type ListCodexModelsOptions = {
  codexPath: string;
  codexHome?: string;
  includeHidden?: boolean;
  requestTimeoutMs?: number;
  context?: InvocationContext;
};

export type ProbeCodexAuthOptions = {
  codexPath: string;
  codexHome?: string;
  includeModelProbe?: boolean;
  requestTimeoutMs?: number;
  context?: InvocationContext;
};

export type ProbeCodexAuthResult = {
  authenticated: boolean;
  requiresOpenaiAuth: boolean;
  accountType?: string;
  accountEmail?: string;
  planType?: string;
  loginRequired: boolean;
  authUrl?: string;
  modelCount?: number;
  sampleModels?: string[];
};

export type StartCodexLoginRelayOptions = {
  ownerId: string;
  codexPath: string;
  codexHome?: string;
  requestTimeoutMs?: number;
  context?: InvocationContext;
};

export type StartedCodexLoginRelay = {
  loginKey: string;
  loginId?: string;
  authUrl: string;
  callbackUrl: string;
  expiresAt: number;
};

export type CompleteCodexLoginRelayOptions = {
  ownerId: string;
  loginKey: string;
  callbackUrlOrQuery: string;
  completionTimeoutMs?: number;
  context?: InvocationContext;
};

export type CompleteCodexLoginViaCallbackOptions = {
  callbackUrlOrQuery: string;
  codexPath: string;
  codexHome?: string;
  requestTimeoutMs?: number;
  waitForAuthMs?: number;
  context?: InvocationContext;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  method: string;
};

type CodexLaunchSpec = {
  command: string;
  argsPrefix: string[];
  label: string;
  source: "explicit" | "bundled" | "path";
};

type PendingCodexLogin = {
  ownerId: string;
  loginKey: string;
  loginId?: string;
  authUrl: string;
  callbackUrl: string;
  expiresAt: number;
  session: CodexAppServerSession;
  completion: Promise<void>;
  stopRemoteTaskPump?: () => void;
};

type CodexLoginSessionDoc = {
  id: string;
  type: "codex-login-session";
  ownerId: string;
  loginKey: string;
  instanceId: string;
  expiresAt: number;
  createdAt: string;
  updatedAt: string;
};

type CodexLoginTaskDoc = {
  id: string;
  type: "codex-login-task";
  ownerId: string;
  loginKey: string;
  taskId: string;
  callbackUrlOrQuery: string;
  status: "pending" | "success" | "error";
  error?: string;
  createdAt: string;
  updatedAt: string;
};

const requireFromHere = createRequire(import.meta.url);
const pendingCodexLogins = new Map<string, PendingCodexLogin>();
let cachedCoordinationContainerPromise: Promise<Container | null> | null = null;

async function getCodexLoginCoordinationContainer() {
  if (cachedCoordinationContainerPromise) return cachedCoordinationContainerPromise;
  cachedCoordinationContainerPromise = (async () => {
    try {
      const [{ database }, { containers }] = await Promise.all([import("../client.js"), import("../cosmos.js")]);
      return database.container(containers.config);
    } catch {
      return null;
    }
  })();
  return cachedCoordinationContainerPromise;
}

function codexLoginSessionDocId(loginKey: string) {
  return `codex-login-session:${loginKey}`;
}

function codexLoginTaskDocId(loginKey: string) {
  return `codex-login-task:${loginKey}`;
}

function codexInstanceId() {
  return (
    (process.env.WEBSITE_INSTANCE_ID || "").trim() ||
    (process.env.WEBSITE_HOSTNAME || "").trim() ||
    `pid-${process.pid}`
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function formatJsonRpcError(error: unknown): string {
  if (!isRecord(error)) return toErrorMessage(error);
  const code = typeof error.code === "number" ? error.code : undefined;
  const message = typeof error.message === "string" ? error.message : toErrorMessage(error);
  return code == null ? message : `${message} (code ${code})`;
}

function parseUsage(value: unknown): CodexUsage | undefined {
  if (!isRecord(value)) return undefined;
  const promptTokens = Number(value.inputTokens || 0);
  const completionTokens = Number(value.outputTokens || 0);
  const totalTokens = Number(value.totalTokens || 0) || promptTokens + completionTokens;
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) return undefined;
  return {
    promptTokens: Number.isFinite(promptTokens) && promptTokens > 0 ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) && completionTokens > 0 ? completionTokens : 0,
    totalTokens,
  };
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureWritableDirectory(dirPath: string): string {
  const normalized = path.resolve(dirPath.trim());
  mkdirSync(normalized, { recursive: true });
  accessSync(normalized, fsConstants.R_OK | fsConstants.W_OK);
  return normalized;
}

function upsertTomlStringSetting(content: string, key: string, value: string) {
  const desired = `${key} = "${value}"`;
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=.*$`, "m");
  if (pattern.test(content)) {
    return content.replace(pattern, desired);
  }
  const trimmed = content.trimEnd();
  return trimmed ? `${trimmed}\n${desired}\n` : `${desired}\n`;
}

function ensureCodexPersistentAuthConfig(codexHome: string) {
  const configPath = path.join(codexHome, CODEX_CONFIG_FILE_NAME);
  let current = "";
  try {
    current = readFileSync(configPath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") throw error;
  }
  let next = current;
  next = upsertTomlStringSetting(next, "cli_auth_credentials_store", "file");
  next = upsertTomlStringSetting(next, "mcp_oauth_credentials_store", "file");
  if (next !== current) {
    writeFileSync(configPath, next, "utf8");
  }
}

function resolveDefaultCodexHomeCandidates() {
  const candidates: string[] = [];
  const runningInAzure = Boolean((process.env.WEBSITE_SITE_NAME || "").trim() || (process.env.WEBSITE_INSTANCE_ID || "").trim());
  if (runningInAzure && process.platform !== "win32") {
    candidates.push(path.join(DEFAULT_CODEX_HOME_AZURE_DIR, "ntechr"));
    candidates.push(DEFAULT_CODEX_HOME_AZURE_DIR);
  }
  candidates.push(path.join(process.cwd(), ".codex-home"));
  candidates.push(path.join(tmpdir(), DEFAULT_CODEX_HOME_TMP_DIR));
  return unique(candidates);
}

function resolveCodexHomePath(requestedHome?: string): string | undefined {
  const explicit = (requestedHome || "").trim();
  if (explicit) {
    try {
      return ensureWritableDirectory(explicit);
    } catch (error) {
      throw new Error(`Configured Codex home is not writable (${explicit}): ${toErrorMessage(error)}`);
    }
  }
  for (const candidate of resolveDefaultCodexHomeCandidates()) {
    try {
      return ensureWritableDirectory(candidate);
    } catch {
      // Try next candidate.
    }
  }
  return undefined;
}

function resolveBundledCodexEntrypoint(): string | undefined {
  try {
    return requireFromHere.resolve("@openai/codex/bin/codex.js");
  } catch {
    return undefined;
  }
}

function resolveCodexLaunchSpec(requestedPath: string): CodexLaunchSpec {
  const raw = requestedPath.trim();
  const normalized = raw || "codex";
  const lowered = normalized.toLowerCase();
  const bundledEntrypoint = resolveBundledCodexEntrypoint();
  const explicitNodeScript = /\.(?:mjs|cjs|js)$/i.test(normalized);

  if (explicitNodeScript) {
    return {
      command: process.execPath,
      argsPrefix: [normalized],
      label: `node ${normalized}`,
      source: "explicit",
    };
  }

  if (!raw || lowered === "codex" || lowered === "@openai/codex") {
    if (bundledEntrypoint) {
      return {
        command: process.execPath,
        argsPrefix: [bundledEntrypoint],
        label: `bundled @openai/codex (${bundledEntrypoint})`,
        source: "bundled",
      };
    }
    return {
      command: "codex",
      argsPrefix: [],
      label: "codex (PATH)",
      source: "path",
    };
  }

  return {
    command: normalized,
    argsPrefix: [],
    label: normalized,
    source: "explicit",
  };
}

function pendingLoginMapKey(ownerId: string, loginKey: string) {
  return `${ownerId}::${loginKey}`;
}

function findPendingLogin(loginKey: string, ownerId?: string) {
  const trimmedLoginKey = loginKey.trim();
  if (!trimmedLoginKey) return null;
  const trimmedOwner = (ownerId || "").trim();
  if (trimmedOwner) {
    const exactKey = pendingLoginMapKey(trimmedOwner, trimmedLoginKey);
    const exact = pendingCodexLogins.get(exactKey);
    if (exact) {
      return { mapKey: exactKey, pending: exact, ownerMatched: true };
    }
  }
  for (const [mapKey, pending] of pendingCodexLogins) {
    if (pending.loginKey !== trimmedLoginKey) continue;
    return { mapKey, pending, ownerMatched: trimmedOwner ? pending.ownerId === trimmedOwner : false };
  }
  return null;
}

async function closePendingLogin(entry: PendingCodexLogin, options?: { keepTaskDoc?: boolean }) {
  entry.stopRemoteTaskPump?.();
  if (!options?.keepTaskDoc) {
    await deleteCodexLoginTaskDoc(entry.loginKey);
  }
  await deleteCodexLoginSessionDoc(entry.loginKey);
  try {
    await entry.session.close();
  } catch {
    // Best-effort close.
  }
}

function cleanupExpiredPendingLogins(now = Date.now()) {
  for (const [key, entry] of pendingCodexLogins) {
    if (entry.expiresAt > now) continue;
    pendingCodexLogins.delete(key);
    void closePendingLogin(entry);
  }
}

async function clearPendingLoginsForOwner(ownerId: string) {
  const keys: string[] = [];
  for (const [key, entry] of pendingCodexLogins) {
    if (entry.ownerId !== ownerId) continue;
    keys.push(key);
  }
  for (const key of keys) {
    const entry = pendingCodexLogins.get(key);
    if (!entry) continue;
    pendingCodexLogins.delete(key);
    await closePendingLogin(entry);
  }
}

function parseCallbackParams(callbackUrlOrQuery: string): URLSearchParams {
  const trimmed = callbackUrlOrQuery.trim();
  if (!trimmed) return new URLSearchParams();
  try {
    const parsed = new URL(trimmed);
    return parsed.searchParams;
  } catch {
    const normalized = trimmed.startsWith("?") ? trimmed.slice(1) : trimmed;
    return new URLSearchParams(normalized);
  }
}

function parseCallbackUrl(callbackUrlOrQuery: string): URL {
  const trimmed = callbackUrlOrQuery.trim();
  if (!trimmed) {
    throw new Error("Missing callback URL.");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    const asQuery = new URLSearchParams(trimmed.startsWith("?") ? trimmed.slice(1) : trimmed);
    const code = asQuery.get("code");
    const state = asQuery.get("state");
    if (!code || !state) {
      throw new Error("Missing authorization code/state. Paste the full localhost callback URL.");
    }
    parsed = new URL("http://localhost/auth/callback");
    parsed.search = asQuery.toString();
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1" && hostname !== "[::1]") {
    throw new Error("Callback URL must point to localhost.");
  }
  return parsed;
}

async function waitWithTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  let timer: NodeJS.Timeout | null = null;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function hasCodexAccount(payload: unknown) {
  if (!isRecord(payload)) return false;
  const account = isRecord(payload.account) ? payload.account : null;
  const accountType = account && typeof account.type === "string" ? account.type : "";
  return Boolean(accountType);
}

async function readCodexLoginSessionDoc(loginKey: string): Promise<CodexLoginSessionDoc | null> {
  const container = await getCodexLoginCoordinationContainer();
  if (!container) return null;
  const id = codexLoginSessionDocId(loginKey);
  try {
    const { resource } = await container.item(id, id).read<CodexLoginSessionDoc>();
    if (!resource || resource.type !== "codex-login-session") return null;
    return resource;
  } catch {
    return null;
  }
}

async function upsertCodexLoginSessionDoc(options: { ownerId: string; loginKey: string; expiresAt: number }) {
  const container = await getCodexLoginCoordinationContainer();
  if (!container) return;
  const now = new Date().toISOString();
  const id = codexLoginSessionDocId(options.loginKey);
  const doc: CodexLoginSessionDoc = {
    id,
    type: "codex-login-session",
    ownerId: options.ownerId,
    loginKey: options.loginKey,
    instanceId: codexInstanceId(),
    expiresAt: options.expiresAt,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await container.items.upsert(doc);
  } catch {
    // Best-effort: coordination fallback unavailable.
  }
}

async function deleteCodexLoginSessionDoc(loginKey: string) {
  const container = await getCodexLoginCoordinationContainer();
  if (!container) return;
  const id = codexLoginSessionDocId(loginKey);
  try {
    await container.item(id, id).delete();
  } catch {
    // Ignore missing docs / best effort cleanup.
  }
}

async function readCodexLoginTaskDoc(loginKey: string): Promise<CodexLoginTaskDoc | null> {
  const container = await getCodexLoginCoordinationContainer();
  if (!container) return null;
  const id = codexLoginTaskDocId(loginKey);
  try {
    const { resource } = await container.item(id, id).read<CodexLoginTaskDoc>();
    if (!resource || resource.type !== "codex-login-task") return null;
    return resource;
  } catch {
    return null;
  }
}

async function upsertCodexLoginTaskDoc(doc: CodexLoginTaskDoc) {
  const container = await getCodexLoginCoordinationContainer();
  if (!container) return;
  try {
    await container.items.upsert(doc);
  } catch {
    // Best-effort write; caller will handle timeout if coordination fails.
  }
}

async function deleteCodexLoginTaskDoc(loginKey: string) {
  const container = await getCodexLoginCoordinationContainer();
  if (!container) return;
  const id = codexLoginTaskDocId(loginKey);
  try {
    await container.item(id, id).delete();
  } catch {
    // Ignore missing docs / best effort cleanup.
  }
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : "")).filter(Boolean);
}

function parseReasoningEfforts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const effort = typeof item.reasoningEffort === "string" ? item.reasoningEffort : "";
    if (effort) out.push(effort);
  }
  return out;
}

function parseModelSummary(value: unknown): CodexModelSummary | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const model = typeof value.model === "string" ? value.model.trim() : "";
  const displayName = typeof value.displayName === "string" ? value.displayName.trim() : "";
  if (!id || !model) return null;
  return {
    id,
    model,
    displayName: displayName || model,
    description: typeof value.description === "string" ? value.description : "",
    hidden: Boolean(value.hidden),
    isDefault: Boolean(value.isDefault),
    supportsPersonality: Boolean(value.supportsPersonality),
    defaultReasoningEffort:
      typeof value.defaultReasoningEffort === "string" && value.defaultReasoningEffort.trim()
        ? value.defaultReasoningEffort
        : undefined,
    inputModalities: parseStringArray(value.inputModalities),
    supportedReasoningEfforts: parseReasoningEfforts(value.supportedReasoningEfforts),
    upgrade: typeof value.upgrade === "string" && value.upgrade.trim() ? value.upgrade : undefined,
  };
}

export class CodexLoginRequiredError extends Error {
  readonly authUrl: string;
  readonly loginId?: string;

  constructor(authUrl: string, loginId?: string) {
    super("Codex ChatGPT authentication required");
    this.name = "CodexLoginRequiredError";
    this.authUrl = authUrl;
    this.loginId = loginId;
  }
}

class CodexAppServerSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly launchSpec: CodexLaunchSpec;
  private readonly resolvedCodexHome?: string;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly notificationHandlers = new Set<(method: string, params: unknown) => void>();
  private nextId = 1;
  private stdoutBuffer = "";
  private stderrTail = "";
  private closed = false;

  constructor(
    private readonly options: RunCodexChatOptions,
    private readonly requestTimeoutMs: number,
  ) {
    const env = { ...process.env };
    this.resolvedCodexHome = resolveCodexHomePath(options.codexHome);
    if (this.resolvedCodexHome) {
      ensureCodexPersistentAuthConfig(this.resolvedCodexHome);
      env.CODEX_HOME = this.resolvedCodexHome;
    }
    this.launchSpec = resolveCodexLaunchSpec(options.codexPath);
    this.child = spawn(this.launchSpec.command, [...this.launchSpec.argsPrefix, "app-server", "--listen", "stdio://"], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
      windowsHide: true,
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.handleStdout(chunk));
    this.child.stderr.on("data", (chunk: string) => {
      this.stderrTail = `${this.stderrTail}${chunk}`.slice(-STDERR_TAIL_MAX);
    });
    this.child.on("error", (error) => {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") {
        this.rejectAll(
          this.decorateError(
            `Codex process error: executable not found using ${this.launchSpec.label}. ` +
              "Install @openai/codex in the API package or set CODEX_PATH to a valid executable.",
          ),
        );
        return;
      }
      this.rejectAll(this.decorateError(`Codex process error: ${toErrorMessage(error)}`));
    });
    this.child.on("exit", (code, signal) => {
      if (this.closed) return;
      this.rejectAll(this.decorateError(`Codex process exited before completion (code=${code ?? "null"}, signal=${signal ?? "null"})`));
    });
  }

  private decorateError(message: string): Error {
    const details = [`launch=${this.launchSpec.label}`];
    if (this.resolvedCodexHome) details.push(`CODEX_HOME=${this.resolvedCodexHome}`);
    details.push(`source=${this.launchSpec.source}`);
    const tail = this.stderrTail.trim();
    const withRuntime = `${message}. codex runtime: ${details.join(", ")}`;
    return new Error(tail ? `${withRuntime}. codex stderr: ${tail}` : withRuntime);
  }

  private rejectAll(error: Error) {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private handleStdout(chunk: string) {
    this.stdoutBuffer += chunk;
    for (;;) {
      const newlineIndex = this.stdoutBuffer.indexOf("\n");
      if (newlineIndex < 0) break;
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (!line) continue;
      this.routeMessage(line);
    }
  }

  private routeMessage(line: string) {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!isRecord(message)) return;

    const hasId = Object.prototype.hasOwnProperty.call(message, "id");
    const method = typeof message.method === "string" ? message.method : undefined;

    if (hasId && method) {
      void this.handleServerRequest(message);
      return;
    }

    if (hasId) {
      const key = String(message.id as JsonRpcId);
      const pending = this.pending.get(key);
      if (!pending) return;
      this.pending.delete(key);
      clearTimeout(pending.timer);
      if (Object.prototype.hasOwnProperty.call(message, "error") && message.error != null) {
        pending.reject(this.decorateError(`${pending.method} failed: ${formatJsonRpcError(message.error)}`));
        return;
      }
      pending.resolve(message.result);
      return;
    }

    if (!method) return;
    const params = Object.prototype.hasOwnProperty.call(message, "params") ? message.params : undefined;
    for (const handler of this.notificationHandlers) {
      handler(method, params);
    }
  }

  private sendRaw(payload: Record<string, unknown>) {
    if (this.child.stdin.destroyed || !this.child.stdin.writable) {
      throw this.decorateError("Codex stdin is not writable");
    }
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private sendResult(id: JsonRpcId, result: unknown) {
    this.sendRaw({ id, result });
  }

  private sendError(id: JsonRpcId, code: number, message: string) {
    this.sendRaw({ id, error: { code, message } });
  }

  private async handleServerRequest(message: Record<string, unknown>) {
    const id = message.id as JsonRpcId;
    const method = String(message.method || "");
    try {
      if (method === "item/commandExecution/requestApproval") {
        this.sendResult(id, { decision: "cancel" });
        return;
      }
      if (method === "item/fileChange/requestApproval") {
        this.sendResult(id, { decision: "cancel" });
        return;
      }
      if (method === "execCommandApproval") {
        this.sendResult(id, { decision: "abort" });
        return;
      }
      if (method === "applyPatchApproval") {
        this.sendResult(id, { decision: "abort" });
        return;
      }
      if (method === "item/tool/requestUserInput") {
        this.sendResult(id, { answers: {} });
        return;
      }
      if (method === "item/tool/call") {
        this.sendResult(id, {
          success: false,
          contentItems: [{ type: "inputText", text: "Tool calls are disabled in this integration." }],
        });
        return;
      }
      if (method === "account/chatgptAuthTokens/refresh") {
        this.sendError(id, -32000, "External chatgptAuthTokens refresh is not supported by this integration.");
        return;
      }
      this.sendError(id, -32601, `Unsupported server request method: ${method}`);
    } catch (error) {
      this.sendError(id, -32000, this.decorateError(toErrorMessage(error)).message);
    }
  }

  request(method: string, params: unknown, timeoutMs = this.requestTimeoutMs): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    const key = String(id);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key);
        reject(this.decorateError(`Timed out waiting for ${method} response`));
      }, timeoutMs);
      this.pending.set(key, { resolve, reject, timer, method });
      try {
        this.sendRaw({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(key);
        reject(this.decorateError(`Failed to send ${method}: ${toErrorMessage(error)}`));
      }
    });
  }

  notify(method: string, params?: unknown) {
    if (params === undefined) {
      this.sendRaw({ method });
      return;
    }
    this.sendRaw({ method, params });
  }

  onNotification(handler: (method: string, params: unknown) => void): () => void {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
  }

  async initialize() {
    await this.request("initialize", {
      clientInfo: {
        name: "ntechr-api",
        title: "ntechr API",
        version: "1.0.0",
      },
      capabilities: { experimentalApi: false },
    });
    this.notify("initialized", {});
  }

  async ensureAuthenticated() {
    const accountRead = await this.request("account/read", { refreshToken: true });
    const accountPayload = isRecord(accountRead) ? accountRead : {};
    const account = isRecord(accountPayload.account) ? accountPayload.account : null;
    const requiresAuth = Boolean(accountPayload.requiresOpenaiAuth);
    const accountType = account && typeof account.type === "string" ? account.type : "";

    if (accountType) return;
    if (!requiresAuth) return;

    const loginResult = await this.request("account/login/start", { type: "chatgpt" });
    const loginPayload = isRecord(loginResult) ? loginResult : {};
    const authUrl = typeof loginPayload.authUrl === "string" ? loginPayload.authUrl.trim() : "";
    const loginId = typeof loginPayload.loginId === "string" ? loginPayload.loginId : undefined;
    if (authUrl) {
      throw new CodexLoginRequiredError(authUrl, loginId);
    }
    throw new Error("Codex authentication is required. Log in with ChatGPT and retry.");
  }

  async startChatgptLoginIfRequired(): Promise<
    | { status: "authenticated" }
    | { status: "login_required"; authUrl: string; loginId?: string; callbackUrl: string }
  > {
    const accountRead = await this.request("account/read", { refreshToken: true });
    const accountPayload = isRecord(accountRead) ? accountRead : {};
    const account = isRecord(accountPayload.account) ? accountPayload.account : null;
    const requiresAuth = Boolean(accountPayload.requiresOpenaiAuth);
    const accountType = account && typeof account.type === "string" ? account.type : "";
    if (accountType || !requiresAuth) {
      return { status: "authenticated" };
    }

    const loginResult = await this.request("account/login/start", { type: "chatgpt" });
    const loginPayload = isRecord(loginResult) ? loginResult : {};
    const authUrl = typeof loginPayload.authUrl === "string" ? loginPayload.authUrl.trim() : "";
    const loginId = typeof loginPayload.loginId === "string" ? loginPayload.loginId : undefined;
    if (!authUrl) {
      throw new Error("Codex login/start did not return authUrl.");
    }
    let callbackUrl = "";
    try {
      callbackUrl = new URL(authUrl).searchParams.get("redirect_uri") || "";
    } catch {
      callbackUrl = "";
    }
    if (!callbackUrl) {
      throw new Error("Codex login/start returned authUrl without redirect_uri.");
    }
    return { status: "login_required", authUrl, loginId, callbackUrl };
  }

  async listModels(includeHidden = false): Promise<CodexModelSummary[]> {
    const allModels: CodexModelSummary[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;

    for (;;) {
      const result = await this.request("model/list", {
        cursor: cursor || null,
        includeHidden,
        limit: 100,
      });
      const payload = isRecord(result) ? result : {};
      const data = Array.isArray(payload.data) ? payload.data : [];
      for (const item of data) {
        const parsed = parseModelSummary(item);
        if (!parsed) continue;
        if (seen.has(parsed.model)) continue;
        seen.add(parsed.model);
        allModels.push(parsed);
      }
      const next = typeof payload.nextCursor === "string" ? payload.nextCursor.trim() : "";
      if (!next) break;
      cursor = next;
    }

    return allModels;
  }

  async runTurn(): Promise<CodexChatResult> {
    const cwd = (this.options.cwd || "").trim() || process.cwd();
    const threadStarted = await this.request("thread/start", {
      model: this.options.model,
      cwd,
      approvalPolicy: "never",
      sandbox: "read-only",
      developerInstructions: this.options.developerInstructions,
      ephemeral: true,
    });
    const threadPayload = isRecord(threadStarted) ? threadStarted : {};
    const thread = isRecord(threadPayload.thread) ? threadPayload.thread : null;
    const threadId = thread && typeof thread.id === "string" ? thread.id : "";
    if (!threadId) {
      throw this.decorateError("Codex thread/start did not return a thread id");
    }

    let expectedTurnId = "";
    let streamedText = "";
    let lastAgentMessage = "";
    let lastFinalAnswer = "";
    let usage: CodexUsage | undefined;

    let settle: ((error?: Error) => void) | null = null;
    const turnDone = new Promise<void>((resolve, reject) => {
      settle = (error?: Error) => (error ? reject(error) : resolve());
    });

    const stopListening = this.onNotification((method, params) => {
      if (!isRecord(params)) return;
      if (method === "item/agentMessage/delta") {
        const turnId = typeof params.turnId === "string" ? params.turnId : "";
        if (!expectedTurnId) expectedTurnId = turnId;
        if (expectedTurnId && turnId !== expectedTurnId) return;
        const delta = typeof params.delta === "string" ? params.delta : "";
        if (!delta) return;
        streamedText += delta;
        this.options.onDelta?.(delta);
        return;
      }
      if (method === "item/completed") {
        const turnId = typeof params.turnId === "string" ? params.turnId : "";
        if (!expectedTurnId) expectedTurnId = turnId;
        if (expectedTurnId && turnId !== expectedTurnId) return;
        const item = isRecord(params.item) ? params.item : null;
        if (!item || item.type !== "agentMessage") return;
        const text = typeof item.text === "string" ? item.text : "";
        if (!text) return;
        lastAgentMessage = text;
        const phase = typeof item.phase === "string" ? item.phase : "";
        if (phase === "final_answer") {
          lastFinalAnswer = text;
        }
        return;
      }
      if (method === "thread/tokenUsage/updated") {
        const turnId = typeof params.turnId === "string" ? params.turnId : "";
        if (!expectedTurnId) expectedTurnId = turnId;
        if (expectedTurnId && turnId !== expectedTurnId) return;
        const tokenUsage = isRecord(params.tokenUsage) ? params.tokenUsage : null;
        const latest = tokenUsage && isRecord(tokenUsage.last) ? tokenUsage.last : null;
        const parsed = parseUsage(latest);
        if (parsed) usage = parsed;
        return;
      }
      if (method === "turn/completed") {
        const turn = isRecord(params.turn) ? params.turn : null;
        const turnId = turn && typeof turn.id === "string" ? turn.id : "";
        if (!expectedTurnId) expectedTurnId = turnId;
        if (expectedTurnId && turnId !== expectedTurnId) return;
        const status = turn && typeof turn.status === "string" ? turn.status : "";
        if (status === "failed") {
          const errorRecord = turn && isRecord(turn.error) ? turn.error : null;
          const failureMessage =
            (errorRecord && typeof errorRecord.message === "string" && errorRecord.message.trim()) ||
            "Codex turn failed.";
          settle?.(this.decorateError(failureMessage));
          return;
        }
        if (status === "interrupted") {
          settle?.(this.decorateError("Codex turn was interrupted."));
          return;
        }
        settle?.();
      }
    });

    const turnTimeoutMs = Number.isFinite(this.options.turnTimeoutMs) ? Number(this.options.turnTimeoutMs) : DEFAULT_CODEX_TURN_TIMEOUT_MS;
    const turnTimer = setTimeout(() => {
      settle?.(this.decorateError("Codex turn timed out."));
    }, turnTimeoutMs);

    try {
      const turnStarted = await this.request("turn/start", {
        threadId,
        input: [{ type: "text", text: this.options.inputText }],
        cwd,
        model: this.options.model,
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly" },
        effort: "medium",
        outputSchema: this.options.outputSchema,
      });
      const turnPayload = isRecord(turnStarted) ? turnStarted : {};
      const turn = isRecord(turnPayload.turn) ? turnPayload.turn : null;
      const startedTurnId = turn && typeof turn.id === "string" ? turn.id : "";
      if (startedTurnId) expectedTurnId = startedTurnId;
      await turnDone;
    } finally {
      clearTimeout(turnTimer);
      stopListening();
    }

    const assistantText = (lastFinalAnswer || lastAgentMessage || streamedText || "").trim();
    return {
      assistantText,
      model: this.options.model,
      usage,
    };
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.rejectAll(this.decorateError("Codex session closed"));

    if (this.child.stdin.writable) {
      this.child.stdin.end();
    }
    if (!this.child.killed) {
      this.child.kill("SIGTERM");
    }

    const killTimer = setTimeout(() => {
      if (!this.child.killed) {
        this.child.kill("SIGKILL");
      }
    }, 1000);
    try {
      await Promise.race([
        once(this.child, "exit"),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } finally {
      clearTimeout(killTimer);
    }
  }
}

function buildInputText(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  const lines: string[] = [];
  for (const message of messages) {
    const role = message.role === "assistant" ? "ASSISTANT" : "USER";
    const content = message.content.trim();
    if (!content) continue;
    lines.push(`${role}: ${content}`);
  }
  if (!lines.length) {
    return "USER: (no message provided)";
  }
  return lines.join("\n\n");
}

export async function runCodexChat(options: RunCodexChatOptions): Promise<CodexChatResult> {
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) ? Number(options.requestTimeoutMs) : DEFAULT_CODEX_RPC_TIMEOUT_MS;
  const session = new CodexAppServerSession(options, requestTimeoutMs);
  try {
    await session.initialize();
    await session.ensureAuthenticated();
    return await session.runTurn();
  } catch (error) {
    options.context?.log(`Codex request failed: ${toErrorMessage(error)}`);
    throw error;
  } finally {
    await session.close();
  }
}

export function buildCodexTurnInput(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  return buildInputText(messages);
}

function isRecoverableRelayError(message: string) {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("status 400") ||
    lowered.includes("timed out waiting for codex login completion") ||
    lowered.includes("missing authorization code") ||
    lowered.includes("missing state parameter")
  );
}

async function forwardPendingLoginCallback(
  pending: PendingCodexLogin,
  callbackUrlOrQuery: string,
  completionTimeoutMs?: number,
) {
  const callbackParams = parseCallbackParams(callbackUrlOrQuery);
  if (!callbackParams.get("code")) {
    throw new Error("Missing authorization code. Paste the full localhost callback URL after login.");
  }
  if (!callbackParams.get("state")) {
    throw new Error("Missing state parameter. Paste the full localhost callback URL after login.");
  }

  const relayCallback = new URL(pending.callbackUrl);
  for (const key of Array.from(relayCallback.searchParams.keys())) {
    relayCallback.searchParams.delete(key);
  }
  for (const [key, value] of callbackParams.entries()) {
    relayCallback.searchParams.set(key, value);
  }

  const forwarded = await fetch(relayCallback.toString(), {
    method: "GET",
    redirect: "manual",
  });
  if (forwarded.status >= 400) {
    throw new Error(`Codex callback relay failed with status ${forwarded.status}.`);
  }

  const waitMs = Number.isFinite(completionTimeoutMs) ? Number(completionTimeoutMs) : DEFAULT_CODEX_LOGIN_COMPLETE_TIMEOUT_MS;
  await waitWithTimeout(
    pending.completion,
    waitMs,
    "Timed out waiting for Codex login completion. Try again and repaste the callback URL.",
  );

  const ok = await waitForSessionAuthenticated(pending.session, 7000);
  if (!ok) {
    throw new Error("Codex login completion event received, but authenticated account state was not observed.");
  }
}

async function enqueueRemoteCodexLoginCallback(options: {
  ownerId: string;
  loginKey: string;
  callbackUrlOrQuery: string;
  completionTimeoutMs?: number;
  context?: InvocationContext;
}) {
  const callbackParams = parseCallbackParams(options.callbackUrlOrQuery);
  if (!callbackParams.get("code")) {
    throw new Error("Missing authorization code. Paste the full localhost callback URL after login.");
  }
  if (!callbackParams.get("state")) {
    throw new Error("Missing state parameter. Paste the full localhost callback URL after login.");
  }

  const sessionDoc = await readCodexLoginSessionDoc(options.loginKey);
  if (!sessionDoc) {
    throw new Error("No pending Codex login session found. Start login again.");
  }
  if (sessionDoc.ownerId !== options.ownerId) {
    throw new Error("Pending Codex login session belongs to a different user.");
  }
  if (sessionDoc.expiresAt <= Date.now()) {
    await Promise.allSettled([deleteCodexLoginSessionDoc(options.loginKey), deleteCodexLoginTaskDoc(options.loginKey)]);
    throw new Error("Pending Codex login session expired. Start login again.");
  }

  const now = new Date().toISOString();
  const taskId = randomUUID();
  await upsertCodexLoginTaskDoc({
    id: codexLoginTaskDocId(options.loginKey),
    type: "codex-login-task",
    ownerId: options.ownerId,
    loginKey: options.loginKey,
    taskId,
    callbackUrlOrQuery: options.callbackUrlOrQuery,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  const timeoutMs = Number.isFinite(options.completionTimeoutMs)
    ? Number(options.completionTimeoutMs)
    : DEFAULT_CODEX_LOGIN_COMPLETE_TIMEOUT_MS;
  const deadline = Date.now() + Math.max(1000, timeoutMs + 5000);

  for (;;) {
    const taskDoc = await readCodexLoginTaskDoc(options.loginKey);
    if (taskDoc && taskDoc.taskId === taskId) {
      if (taskDoc.status === "success") {
        await deleteCodexLoginTaskDoc(options.loginKey);
        return;
      }
      if (taskDoc.status === "error") {
        throw new Error(taskDoc.error || "Codex login relay task failed.");
      }
    }
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for Codex login relay completion on owning server instance.");
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

function startRemoteTaskPumpForPendingLogin(
  pending: PendingCodexLogin,
  options?: { context?: InvocationContext; completionTimeoutMs?: number },
) {
  let running = false;
  let lastHandledTaskId = "";
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const task = await readCodexLoginTaskDoc(pending.loginKey);
      if (!task || task.status !== "pending") return;
      if (task.taskId === lastHandledTaskId) return;
      if (task.ownerId !== pending.ownerId) return;
      lastHandledTaskId = task.taskId;

      try {
        await forwardPendingLoginCallback(pending, task.callbackUrlOrQuery, options?.completionTimeoutMs);
        await upsertCodexLoginTaskDoc({
          ...task,
          status: "success",
          error: undefined,
          updatedAt: new Date().toISOString(),
        });
        pendingCodexLogins.delete(pendingLoginMapKey(pending.ownerId, pending.loginKey));
        await closePendingLogin(pending, { keepTaskDoc: true });
      } catch (error) {
        const message = toErrorMessage(error);
        await upsertCodexLoginTaskDoc({
          ...task,
          status: "error",
          error: message,
          updatedAt: new Date().toISOString(),
        });
        if (!isRecoverableRelayError(message)) {
          options?.context?.log(`Codex remote relay unrecoverable error; closing pending login ${pending.loginKey}: ${message}`);
          pendingCodexLogins.delete(pendingLoginMapKey(pending.ownerId, pending.loginKey));
          await closePendingLogin(pending);
        }
      }
    } finally {
      running = false;
    }
  }, 350);

  timer.unref?.();
  return () => clearInterval(timer);
}

export async function startCodexLoginRelay(options: StartCodexLoginRelayOptions): Promise<StartedCodexLoginRelay | null> {
  cleanupExpiredPendingLogins();
  const ownerId = options.ownerId.trim();
  if (!ownerId) {
    throw new Error("ownerId is required for Codex login relay.");
  }

  await clearPendingLoginsForOwner(ownerId);

  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) ? Number(options.requestTimeoutMs) : DEFAULT_CODEX_RPC_TIMEOUT_MS;
  const session = new CodexAppServerSession(
    {
      codexPath: options.codexPath,
      codexHome: options.codexHome,
      model: "gpt-5.1-codex",
      developerInstructions: "",
      inputText: "",
      context: options.context,
    },
    requestTimeoutMs,
  );

  try {
    await session.initialize();
    const loginStatus = await session.startChatgptLoginIfRequired();
    if (loginStatus.status === "authenticated") {
      await session.close();
      return null;
    }

    const loginKey = randomUUID();
    const expiresAt = Date.now() + DEFAULT_CODEX_LOGIN_TTL_MS;
    let settled = false;
    let resolveCompletion: (() => void) | null = null;
    let rejectCompletion: ((error: Error) => void) | null = null;
    const completionPromise = new Promise<void>((resolve, reject) => {
      resolveCompletion = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      rejectCompletion = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
    });

    const loginId = loginStatus.loginId;
    const stopListening = session.onNotification((method, params) => {
      if (!isRecord(params)) return;
      if (method === "account/login/completed") {
        const eventLoginId = typeof params.loginId === "string" ? params.loginId : undefined;
        if (loginId && eventLoginId && eventLoginId !== loginId) return;
        const success = Boolean(params.success);
        if (success) {
          resolveCompletion?.();
          return;
        }
        const errorText = typeof params.error === "string" && params.error.trim() ? params.error.trim() : "Codex login failed.";
        rejectCompletion?.(new Error(errorText));
        return;
      }
      if (method === "account/updated") {
        const authMode = typeof params.authMode === "string" ? params.authMode : "";
        if (authMode === "chatgpt") {
          void (async () => {
            try {
              const accountRead = await session.request("account/read", { refreshToken: true });
              if (hasCodexAccount(accountRead)) {
                resolveCompletion?.();
              }
            } catch {
              // Ignore transient read errors; account/login/completed or timeout will decide outcome.
            }
          })();
        }
      }
    });

    const completion = completionPromise.finally(() => {
      stopListening();
    });
    const pending: PendingCodexLogin = {
      ownerId,
      loginKey,
      loginId,
      authUrl: loginStatus.authUrl,
      callbackUrl: loginStatus.callbackUrl,
      expiresAt,
      session,
      completion,
    };
    pendingCodexLogins.set(pendingLoginMapKey(ownerId, loginKey), pending);
    pending.stopRemoteTaskPump = startRemoteTaskPumpForPendingLogin(pending, {
      context: options.context,
      completionTimeoutMs: DEFAULT_CODEX_LOGIN_COMPLETE_TIMEOUT_MS,
    });
    await upsertCodexLoginSessionDoc({ ownerId, loginKey, expiresAt });
    await deleteCodexLoginTaskDoc(loginKey);

    return {
      loginKey,
      loginId,
      authUrl: loginStatus.authUrl,
      callbackUrl: loginStatus.callbackUrl,
      expiresAt,
    };
  } catch (error) {
    await session.close();
    throw error;
  }
}

export async function completeCodexLoginRelay(options: CompleteCodexLoginRelayOptions) {
  cleanupExpiredPendingLogins();
  const ownerId = options.ownerId.trim();
  const loginKey = options.loginKey.trim();
  if (!ownerId || !loginKey) {
    throw new Error("ownerId and loginKey are required for Codex login relay completion.");
  }

  const found = findPendingLogin(loginKey, ownerId);
  if (!found) {
    await enqueueRemoteCodexLoginCallback({
      ownerId,
      loginKey,
      callbackUrlOrQuery: options.callbackUrlOrQuery,
      completionTimeoutMs: options.completionTimeoutMs,
      context: options.context,
    });
    return;
  }
  const { mapKey, pending } = found;
  if (!found.ownerMatched) {
    options.context?.log(`Codex login relay owner mismatch for loginKey=${loginKey}; completing via matching pending session.`);
  }
  if (pending.expiresAt <= Date.now()) {
    pendingCodexLogins.delete(mapKey);
    await closePendingLogin(pending);
    throw new Error("Pending Codex login session expired. Start login again.");
  }

  try {
    await forwardPendingLoginCallback(pending, options.callbackUrlOrQuery, options.completionTimeoutMs);
  } catch (error) {
    const message = toErrorMessage(error);
    const keepPending = isRecoverableRelayError(message);
    if (!keepPending) {
      pendingCodexLogins.delete(mapKey);
      await closePendingLogin(pending);
    }
    throw error;
  }

  pendingCodexLogins.delete(mapKey);
  await closePendingLogin(pending);
}

async function checkCodexAuthenticated(options: { codexPath: string; codexHome?: string; requestTimeoutMs?: number; context?: InvocationContext }) {
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) ? Number(options.requestTimeoutMs) : DEFAULT_CODEX_RPC_TIMEOUT_MS;
  const session = new CodexAppServerSession(
    {
      codexPath: options.codexPath,
      codexHome: options.codexHome,
      model: "gpt-5.1-codex",
      developerInstructions: "",
      inputText: "",
      context: options.context,
    },
    requestTimeoutMs,
  );
  try {
    await session.initialize();
    const result = await session.request("account/read", { refreshToken: true });
    return hasCodexAccount(result);
  } finally {
    await session.close();
  }
}

async function waitForSessionAuthenticated(session: CodexAppServerSession, waitForAuthMs: number) {
  const deadline = Date.now() + Math.max(500, waitForAuthMs);
  for (;;) {
    const accountRead = await session.request("account/read", { refreshToken: true });
    if (hasCodexAccount(accountRead)) return true;
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

export async function completeCodexLoginViaCallback(options: CompleteCodexLoginViaCallbackOptions) {
  const callbackUrl = parseCallbackUrl(options.callbackUrlOrQuery);
  const params = parseCallbackParams(callbackUrl.toString());
  if (!params.get("code")) {
    throw new Error("Missing authorization code. Paste the full localhost callback URL after login.");
  }
  if (!params.get("state")) {
    throw new Error("Missing state parameter. Paste the full localhost callback URL after login.");
  }

  const waitForAuthMs = Number.isFinite(options.waitForAuthMs) ? Number(options.waitForAuthMs) : 7000;
  let directError = "";
  try {
    const forwarded = await fetch(callbackUrl.toString(), {
      method: "GET",
      redirect: "manual",
    });
    if (forwarded.status >= 400) {
      throw new Error(`Codex callback relay failed with status ${forwarded.status}.`);
    }
    const deadline = Date.now() + Math.max(500, waitForAuthMs);
    for (;;) {
      const ok = await checkCodexAuthenticated({
        codexPath: options.codexPath,
        codexHome: options.codexHome,
        requestTimeoutMs: options.requestTimeoutMs,
        context: options.context,
      });
      if (ok) return;
      if (Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    directError = "Codex callback was forwarded, but authentication did not complete in time.";
  } catch (error) {
    directError =
      `Unable to reach Codex localhost callback (${callbackUrl.host}) directly. ` +
      `If this is hosted, start/complete may have hit different server workers. Original error: ${toErrorMessage(error)}`;
  }

  let replayError = "";
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) ? Number(options.requestTimeoutMs) : DEFAULT_CODEX_RPC_TIMEOUT_MS;
  const replaySession = new CodexAppServerSession(
    {
      codexPath: options.codexPath,
      codexHome: options.codexHome,
      model: "gpt-5.1-codex",
      developerInstructions: "",
      inputText: "",
      context: options.context,
    },
    requestTimeoutMs,
  );
  try {
    await replaySession.initialize();
    const loginStatus = await replaySession.startChatgptLoginIfRequired();
    if (loginStatus.status === "authenticated") {
      return;
    }
    const relayCallback = new URL(loginStatus.callbackUrl);
    for (const key of Array.from(relayCallback.searchParams.keys())) {
      relayCallback.searchParams.delete(key);
    }
    for (const [key, value] of params.entries()) {
      relayCallback.searchParams.set(key, value);
    }
    const forwarded = await fetch(relayCallback.toString(), {
      method: "GET",
      redirect: "manual",
    });
    if (forwarded.status >= 400) {
      throw new Error(`Codex callback replay failed with status ${forwarded.status}.`);
    }
    const ok = await waitForSessionAuthenticated(replaySession, waitForAuthMs);
    if (ok) return;
    replayError = "Codex callback replay succeeded, but authentication did not complete in time.";
  } catch (error) {
    replayError = toErrorMessage(error);
  } finally {
    await replaySession.close();
  }

  const details = [directError, replayError].filter(Boolean).join(" Replay attempt: ");
  throw new Error(`Unable to complete Codex login from callback URL. ${details}`);
}

export async function probeCodexAuth(options: ProbeCodexAuthOptions): Promise<ProbeCodexAuthResult> {
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) ? Number(options.requestTimeoutMs) : DEFAULT_CODEX_RPC_TIMEOUT_MS;
  const session = new CodexAppServerSession(
    {
      codexPath: options.codexPath,
      codexHome: options.codexHome,
      model: "gpt-5.1-codex",
      developerInstructions: "",
      inputText: "",
      context: options.context,
    },
    requestTimeoutMs,
  );

  try {
    await session.initialize();
    const accountRead = await session.request("account/read", { refreshToken: true });
    const payload = isRecord(accountRead) ? accountRead : {};
    const account = isRecord(payload.account) ? payload.account : null;
    const requiresOpenaiAuth = Boolean(payload.requiresOpenaiAuth);
    const accountType = account && typeof account.type === "string" ? account.type : "";
    const accountEmail = account && typeof account.email === "string" ? account.email : "";
    const planType = account && typeof account.planType === "string" ? account.planType : "";

    const result: ProbeCodexAuthResult = {
      authenticated: Boolean(accountType),
      requiresOpenaiAuth,
      accountType: accountType || undefined,
      accountEmail: accountEmail || undefined,
      planType: planType || undefined,
      loginRequired: false,
    };

    if (!accountType && requiresOpenaiAuth) {
      result.loginRequired = true;
      try {
        const loginStatus = await session.startChatgptLoginIfRequired();
        if (loginStatus.status === "login_required") {
          result.authUrl = loginStatus.authUrl;
        }
      } catch (error) {
        options.context?.log(`Codex auth probe login/start failed: ${toErrorMessage(error)}`);
      }
      return result;
    }

    if (options.includeModelProbe && accountType) {
      try {
        const models = await session.listModels(false);
        result.modelCount = models.length;
        result.sampleModels = models.slice(0, 8).map((m) => m.model);
      } catch (error) {
        options.context?.log(`Codex auth probe model/list failed: ${toErrorMessage(error)}`);
      }
    }

    return result;
  } finally {
    await session.close();
  }
}

export async function listCodexModels(options: ListCodexModelsOptions): Promise<CodexModelSummary[]> {
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) ? Number(options.requestTimeoutMs) : DEFAULT_CODEX_RPC_TIMEOUT_MS;
  const session = new CodexAppServerSession(
    {
      codexPath: options.codexPath,
      codexHome: options.codexHome,
      model: "gpt-5.1-codex",
      developerInstructions: "",
      inputText: "",
      context: options.context,
    },
    requestTimeoutMs,
  );
  try {
    await session.initialize();
    await session.ensureAuthenticated();
    return await session.listModels(Boolean(options.includeHidden));
  } catch (error) {
    options.context?.log(`Codex model/list failed: ${toErrorMessage(error)}`);
    throw error;
  } finally {
    await session.close();
  }
}
