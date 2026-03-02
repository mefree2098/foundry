import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { accessSync, constants as fsConstants, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import type { InvocationContext } from "@azure/functions";

const DEFAULT_CODEX_RPC_TIMEOUT_MS = Number(process.env.CODEX_RPC_TIMEOUT_MS || 45000);
const DEFAULT_CODEX_TURN_TIMEOUT_MS = Number(process.env.CODEX_TURN_TIMEOUT_MS || 180000);
const STDERR_TAIL_MAX = 2000;
const DEFAULT_CODEX_HOME_TMP_DIR = "ntechr-codex-home";
const DEFAULT_CODEX_HOME_AZURE_DIR = "/home/site/.codex";

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

const requireFromHere = createRequire(import.meta.url);

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

function ensureWritableDirectory(dirPath: string): string {
  const normalized = path.resolve(dirPath.trim());
  mkdirSync(normalized, { recursive: true });
  accessSync(normalized, fsConstants.R_OK | fsConstants.W_OK);
  return normalized;
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
    const accountRead = await this.request("account/read", { refreshToken: false });
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
