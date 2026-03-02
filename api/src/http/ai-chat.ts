import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { z } from "zod";
import { ensureAdmin } from "../auth.js";
import type { SiteConfig } from "../types/content.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { siteConfigSchema } from "../types/content.js";
import { recordChatUsage } from "../aiUsage.js";
import { buildCodexTurnInput, CodexLoginRequiredError, runCodexChat } from "../codex/appServer.js";

const INTERNAL_TRAINING = `You are the Foundry admin assistant.

Primary goal: help the admin safely edit the site by proposing concrete actions the platform can apply.

Response rules (critical):
- If the apply_admin_actions tool is available, you MUST call it and not respond with normal text.
- If tools are not available, output strict JSON only: { "assistantMessage": string, "actions": ActionEnvelope[] }.
- Prefer actions over explanations. If an action is possible, propose it.
- If the request is ambiguous, ask a clarifying question and return an empty actions array.
- Never include secrets (API keys, tokens) in assistantMessage or actions.
- assistantMessage must be brief (<= 240 chars) and must not include code blocks, HTML, JSON, or full configuration payloads.
- Do not wrap the JSON response inside assistantMessage or stringify actions. Actions must be real JSON arrays.

Action envelope format (tool args or JSON response):
- Each action item MUST include keys: type, id, value (all strings).
- For delete actions (platform.delete/topic.delete/news.delete): set id to the target id and value to "".
- For all other actions: set id to "" and value to a JSON string payload for that action (example value: {"nav":{"links":[...]}}).

Action rules:
- Use "config.merge" for site configuration changes (themes, nav, homepage sections, custom field schemas).
- The platform deep-merges objects and REPLACES arrays. If you change an array (e.g., nav.links, home.sections, theme.themes), include the full desired array.
- Use *.upsert actions for content changes (platform/topic/news). Use *.delete only when the user explicitly asks to delete.
- Use "media.generate" when you need to create or replace an image asset.

Platform map:
- Navigation: config.nav.links[] items are { id, label, href, enabled?, newTab? }. Internal hrefs start with "/".
- Platform/news links must be a record (object) of label -> url, not an array.
- Homepage builder: config.home.sections[] controls order/visibility. Section types supported:
  - trust, ai, platforms, news, topics, newsletter, richText, cta, contact, embed3d
  - Common fields: { id, type, enabled?, title?, subtitle?, maxItems?, markdown?, cta? }
  - 3D embeds: use section.embed with { mode: "html" | "threejs", html?, script?, height? }.
- Platform/news 3D: set item.custom.embedHtml (full HTML) and item.custom.embedHeight (px).
- Themes: config.theme.themes[] and config.theme.active.
  - Each theme has { id, name, vars } where vars is CSS variable map (e.g., "--color-bg": "#050a0a").
  - Theme intent: Theme 2 uses black background and emerald 3D panels; keep buttons black unless the user requests otherwise.
- Contact settings:
  - config.contact has { enabled, recipientEmail, subjectTemplate, successMessage }.
  - The contact section only renders when config.contact.enabled is true.
- Custom pages:
  - config.pages[] items are { id, title, enabled?, description?, html?, css?, script?, externalScripts?, height? }.
  - Pages render at /<id> and /pages/<id>. Include a nav link to "/<id>" when adding a tab.
  - Custom page code runs inside a sandboxed iframe; include full HTML/CSS/JS content in the fields.
  - Keep code concise and compact (no comments, minimal whitespace); prefer external scripts (CDN) for larger demos to reduce payload size.
- Extra fields:
  - Field definitions live in config.content.schemas.{platforms|news|topics}[].
  - Values are stored on items under item.custom.<fieldId>.

ID rules:
- Content ids must be lowercase with hyphens (slug-like).
- When adding new items or sections, choose unique ids and keep them short.
`;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

const requestSchema = z.object({
  authMode: z.enum(["apiKey", "codexPath"]).optional(),
  apiKey: z.string().min(1).optional(),
  codexPath: z.string().min(1).optional(),
  codexHome: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  messages: z.array(messageSchema).min(1),
  context: z
    .object({
      config: z.unknown().optional(),
      platforms: z.unknown().optional(),
      topics: z.unknown().optional(),
      news: z.unknown().optional(),
    })
    .optional(),
});

type AdminAiAction =
  | { type: "config.merge"; value: Partial<SiteConfig> }
  | { type: "platform.upsert"; value: unknown }
  | { type: "topic.upsert"; value: unknown }
  | { type: "news.upsert"; value: unknown }
  | { type: "platform.delete"; id: string }
  | { type: "topic.delete"; id: string }
  | { type: "news.delete"; id: string }
  | {
      type: "media.generate";
      value: {
        prompt: string;
        targetType: "platform" | "news" | "config";
        targetId?: string;
        field: string;
        size?: string;
        quality?: "low" | "medium" | "high" | "auto";
        background?: "transparent" | "opaque" | "auto";
      };
    };

const responseSchema = z.object({
  assistantMessage: z.string(),
  actions: z.array(z.unknown()).optional(),
});

const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 120000);
const OPENAI_MAX_TOKENS = Number(process.env.OPENAI_MAX_TOKENS || 128000);
const CODEX_TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS || OPENAI_TIMEOUT_MS);
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_CODEX_MODEL = "gpt-5.1-codex";
const APPLY_ACTIONS_TOOL_NAME = "apply_admin_actions";

type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; assistantMessage: string; actions: AdminAiAction[] }
  | { type: "error"; message: string };

const ACTION_ENVELOPE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    assistantMessage: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string" },
          id: { type: "string" },
          value: { type: "string" },
        },
        required: ["type", "id", "value"],
      },
    },
  },
  required: ["assistantMessage", "actions"],
};

function parseActionValue(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "string") {
      const inner = parsed.trim();
      if ((inner.startsWith("{") && inner.endsWith("}")) || (inner.startsWith("[") && inner.endsWith("]"))) {
        try {
          return JSON.parse(inner);
        } catch {
          return parsed;
        }
      }
    }
    return parsed;
  } catch {
    return raw;
  }
}

function normalizeActions(input: unknown): AdminAiAction[] {
  if (!Array.isArray(input)) return [];
  const normalized: AdminAiAction[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const type = typeof raw.type === "string" ? raw.type.trim() : "";
    if (!type) continue;
    if (type.endsWith(".delete")) {
      const id = typeof raw.id === "string" ? raw.id.trim() : "";
      if (id) normalized.push({ type, id } as AdminAiAction);
      continue;
    }
    if (raw.value && typeof raw.value === "object") {
      normalized.push({ type, value: raw.value } as AdminAiAction);
      continue;
    }
    const valueText = typeof raw.value === "string" ? raw.value.trim() : "";
    const parsedValue = valueText ? parseActionValue(valueText) : undefined;
    if (parsedValue !== undefined) {
      normalized.push({ type, value: parsedValue } as AdminAiAction);
    }
  }
  return normalized;
}

function parseAiResponse(raw: string): { assistantMessage: string; actions: AdminAiAction[] } {
  const trimmed = (raw || "").trim();
  if (!trimmed) return { assistantMessage: "", actions: [] };

  const attemptParse = (value: string) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  };

  const findJsonObject = (text: string) => {
    let depth = 0;
    let start = -1;
    let inString = false;
    let escape = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (char === "\\") {
          escape = true;
          continue;
        }
        if (char === "\"") inString = false;
        continue;
      }
      if (char === "\"") {
        inString = true;
        continue;
      }
      if (char === "{") {
        if (depth === 0) start = i;
        depth += 1;
        continue;
      }
      if (char === "}") {
        depth -= 1;
        if (depth === 0 && start !== -1) {
          const candidate = text.slice(start, i + 1);
          const parsed = attemptParse(candidate);
          if (parsed) return parsed;
          start = -1;
        }
      }
    }
    return null;
  };

  const extractActions = (value: unknown): AdminAiAction[] => {
    if (Array.isArray(value)) return value as AdminAiAction[];
    if (typeof value === "string") {
      const parsed = attemptParse(value) || findJsonObject(value);
      if (Array.isArray(parsed)) return parsed as AdminAiAction[];
      if (parsed && typeof parsed === "object") {
        const actions = (parsed as { actions?: unknown }).actions;
        if (Array.isArray(actions)) return actions as AdminAiAction[];
      }
    }
    return [];
  };

  let parsed: unknown = attemptParse(trimmed);

  if (!parsed && trimmed.startsWith("```")) {
    const fenceEnd = trimmed.lastIndexOf("```");
    if (fenceEnd > 3) {
      const inner = trimmed.slice(trimmed.indexOf("\n") + 1, fenceEnd).trim();
      parsed = attemptParse(inner) || findJsonObject(inner);
    }
  }

  if (!parsed) parsed = findJsonObject(trimmed);

  if (parsed) {
    const validated = responseSchema.safeParse(parsed);
    if (validated.success) {
      const actions = normalizeActions(extractActions(validated.data.actions));
      return {
        assistantMessage: validated.data.assistantMessage || "",
        actions,
      };
    }
    if (typeof parsed === "object") {
      const parsedRecord = parsed as { actions?: unknown; assistantMessage?: unknown };
      const actions = normalizeActions(extractActions(parsedRecord.actions));
      const assistantMessage = typeof parsedRecord.assistantMessage === "string" ? parsedRecord.assistantMessage : "";
      if (!actions.length && assistantMessage) {
        const embedded = findJsonObject(assistantMessage);
        if (embedded && typeof embedded === "object") {
          const embeddedRecord = embedded as { actions?: unknown; assistantMessage?: unknown };
          const embeddedActions = normalizeActions(extractActions(embeddedRecord.actions ?? embedded));
          if (embeddedActions.length) {
            const embeddedMessage =
              typeof embeddedRecord.assistantMessage === "string" ? embeddedRecord.assistantMessage : "";
            return {
              assistantMessage: embeddedMessage || assistantMessage || "Proposed actions ready.",
              actions: embeddedActions,
            };
          }
        }
      }
      if (assistantMessage || actions.length) {
        return { assistantMessage, actions };
      }
    }
  }

  // Last resort: if assistantMessage contains JSON, attempt to extract actions from it.
  const embedded = findJsonObject(trimmed);
  if (embedded && typeof embedded === "object") {
    const embeddedActions = (embedded as { actions?: unknown }).actions;
    const actions = normalizeActions(Array.isArray(embeddedActions) ? embeddedActions : []);
    if (actions.length) {
      return { assistantMessage: "Proposed actions ready.", actions };
    }
  }

  const sanitized = trimmed.length > 400 ? `${trimmed.slice(0, 400)}…` : trimmed;
  return { assistantMessage: sanitized, actions: [] };
}

function aiErrorResponse(message: string): HttpResponseInit {
  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assistantMessage: message, actions: [] }),
  };
}

async function recordUsage(
  model: string,
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined,
  context: InvocationContext,
) {
  if (!usage) return;
  if (usage.totalTokens <= 0) return;
  if (!model.trim()) return;
  try {
    await recordChatUsage(model, usage);
  } catch (err) {
    context.log(`Failed to record AI usage: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function streamChatViaCodex(
  {
    codexPath,
    codexHome,
    model,
    systemPrompt,
    messages,
  }: {
    codexPath: string;
    codexHome?: string;
    model: string;
    systemPrompt: string;
    messages: { role: "user" | "assistant"; content: string }[];
  },
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const encoder = new TextEncoder();
  let sentDone = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: StreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      let streamedText = "";
      try {
        const result = await runCodexChat({
          codexPath,
          codexHome,
          model,
          developerInstructions: systemPrompt,
          inputText: buildCodexTurnInput(messages),
          outputSchema: ACTION_ENVELOPE_SCHEMA,
          requestTimeoutMs: CODEX_TIMEOUT_MS,
          turnTimeoutMs: CODEX_TIMEOUT_MS,
          onDelta: (delta) => {
            streamedText += delta;
            send({ type: "delta", text: delta });
          },
          context,
        });

        const assistantText = result.assistantText || streamedText;
        const parsedResponse = parseAiResponse(assistantText);
        await recordUsage(model, result.usage, context);
        send({ type: "done", assistantMessage: parsedResponse.assistantMessage, actions: parsedResponse.actions });
        sentDone = true;
      } catch (err) {
        const message =
          err instanceof CodexLoginRequiredError
            ? `Codex subscription login required. Open this URL and retry: ${err.authUrl}`
            : err instanceof Error
              ? err.message
              : String(err);
        send({ type: "error", message });
      } finally {
        if (!sentDone) {
          const parsed = parseAiResponse(streamedText || "");
          send({ type: "done", assistantMessage: parsed.assistantMessage, actions: parsed.actions });
        }
        controller.close();
      }
    },
  });

  return {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
    body: stream as unknown as HttpResponseInit["body"],
  };
}

async function streamChat(
  {
    apiKey,
    model,
    messages,
  }: {
    apiKey: string;
    model: string;
    messages: { role: string; content: string }[];
  },
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const aborter = new AbortController();
  const timeout = setTimeout(() => aborter.abort(), OPENAI_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_completion_tokens: Number.isFinite(OPENAI_MAX_TOKENS) ? OPENAI_MAX_TOKENS : undefined,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "admin_ai_response",
            strict: true,
            schema: ACTION_ENVELOPE_SCHEMA,
          },
        },
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: aborter.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.name === "AbortError") {
      return { status: 504, body: "OpenAI request timed out. Try again or reduce the request size." };
    }
    return { status: 502, body: `OpenAI request failed: ${message}` };
  } finally {
    clearTimeout(timeout);
  }

      if (!upstream.ok) {
        const text = await upstream.text();
        return { status: 502, body: text || `Upstream error: ${upstream.status}` };
  }

  if (!upstream.body) {
    return { status: 502, body: "OpenAI stream unavailable." };
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";
      let assistantText = "";
      let usage: Record<string, unknown> | null = null;
      let done = false;

      const send = (payload: StreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        while (!done) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });
          let idx = buffer.indexOf("\n\n");
          while (idx !== -1) {
            const chunk = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const lines = chunk.split("\n");
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const data = trimmed.slice(5).trim();
              if (!data) continue;
              if (data === "[DONE]") {
                done = true;
                break;
              }
              let parsed: Record<string, unknown> | null = null;
              try {
                const candidate = JSON.parse(data) as unknown;
                parsed = typeof candidate === "object" && candidate !== null ? (candidate as Record<string, unknown>) : null;
              } catch {
                continue;
              }
              const parsedUsage = parsed && typeof parsed.usage === "object" && parsed.usage !== null ? (parsed.usage as Record<string, unknown>) : null;
              if (parsedUsage) usage = parsedUsage;
              const choices = parsed && Array.isArray(parsed.choices) ? parsed.choices : [];
              const firstChoice = choices[0];
              const delta =
                firstChoice && typeof firstChoice === "object" && firstChoice !== null
                  ? ((firstChoice as { delta?: unknown }).delta as { content?: unknown } | undefined)
                  : undefined;
              const text = typeof delta?.content === "string" ? delta.content : "";
              if (text) {
                assistantText += text;
                send({ type: "delta", text });
              }
            }
            if (done) break;
            idx = buffer.indexOf("\n\n");
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: "error", message });
      }

      const parsedResponse = parseAiResponse(assistantText);
      const assistantMessage = parsedResponse.assistantMessage;
      const actions = parsedResponse.actions;

      if (usage) {
        const promptTokens = Number(usage.prompt_tokens || usage.input_tokens || 0);
        const completionTokens = Number(usage.completion_tokens || usage.output_tokens || 0);
        const totalTokens = Number(usage.total_tokens || 0) || promptTokens + completionTokens;
        if (totalTokens > 0 && model) {
          try {
            await recordChatUsage(model, { promptTokens, completionTokens, totalTokens });
          } catch (err) {
            context.log(`Failed to record AI usage: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      send({ type: "done", assistantMessage, actions });
      controller.close();
    },
  });

  return {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
    body: stream as unknown as HttpResponseInit["body"],
  };
}

async function aiChat(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const auth = ensureAdmin(req);
    if (!auth.ok) return { status: auth.status, body: auth.body };

    const raw = await req.json();
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: 400, body: JSON.stringify(parsed.error.flatten()) };
    }

    const { authMode, apiKey, codexPath, codexHome, model, messages, context: clientContext } = parsed.data;

    let personalityPrompt: string | undefined;
    let storedOpenAiKey: string | undefined;
    let storedOpenAiModel: string | undefined;
    let storedAuthMode: "apiKey" | "codexPath" | undefined;
    let storedCodexPath: string | undefined;
    let storedCodexHome: string | undefined;
    try {
      const container = database.container(containers.config);
      const id = "global";
      const { resource } = await container.item(id, id).read();
      const configParsed = siteConfigSchema.safeParse(resource || {});
      if (configParsed.success) {
        const assistant = configParsed.data.ai?.adminAssistant;
        const personalities = assistant?.personalities || [];
        const activeId = (assistant?.activePersonalityId || "").trim();
        const active = personalities.find((p) => p.id === activeId) || personalities[0];
        personalityPrompt = active?.prompt;
        storedOpenAiKey = assistant?.openai?.apiKey;
        storedOpenAiModel = assistant?.openai?.model;
        storedAuthMode = assistant?.openai?.authMode === "codexPath" ? "codexPath" : assistant?.openai?.authMode === "apiKey" ? "apiKey" : undefined;
        storedCodexPath = assistant?.openai?.codexPath;
        storedCodexHome = assistant?.openai?.codexHome;
      }
    } catch {
      personalityPrompt = undefined;
      storedOpenAiKey = undefined;
      storedOpenAiModel = undefined;
      storedAuthMode = undefined;
      storedCodexPath = undefined;
      storedCodexHome = undefined;
    }

    const finalAuthMode: "apiKey" | "codexPath" = authMode || storedAuthMode || "apiKey";
    const finalModel = (model || storedOpenAiModel || (finalAuthMode === "codexPath" ? DEFAULT_CODEX_MODEL : DEFAULT_OPENAI_MODEL)).trim();
    const finalApiKey = (apiKey || storedOpenAiKey || "").trim();
    const finalCodexPath = (codexPath || storedCodexPath || process.env.CODEX_PATH || "codex").trim();
    const finalCodexHome = (codexHome || storedCodexHome || process.env.CODEX_HOME || "").trim() || undefined;
    if (finalAuthMode === "apiKey" && !finalApiKey) {
      return aiErrorResponse("OpenAI API key not configured. Save it under Admin > AI assistant settings.");
    }
    if (finalAuthMode === "codexPath" && !finalCodexPath) {
      return aiErrorResponse("Codex path is not configured. Set it under Admin > AI assistant settings.");
    }

    const systemPrompt = [
      "You are an admin assistant for a website CMS.",
      "If the apply_admin_actions tool is available, you must call it. If tools are not available, respond with JSON only.",
      "Schema (tool args or JSON response):",
      '{ "assistantMessage": string, "actions": { type: string, id: string, value: string }[] }',
      "",
      "Action envelope rules (tool args or JSON response):",
      '- Every action item must include type, id, value (all strings).',
      '- For delete actions, set id to the target id and value to "".',
      "- For all other actions, set id to \"\" and value to a JSON string payload for that action.",
      "",
      "Action payloads (value JSON string) follow these shapes:",
      '- config.merge => Partial<SiteConfig>',
      '- platform.upsert => Platform',
      '- topic.upsert => Topic',
      '- news.upsert => NewsPost',
      '- media.generate => { prompt, targetType, targetId?, field, size?, quality?, background? }',
      "",
      "Rules:",
      "- Keep actions minimal and safe.",
      "- Do not include secrets in outputs.",
      "- If the request is ambiguous, ask a clarifying question in assistantMessage and return no actions.",
      "- Prefer producing actions that the user can apply; do not just describe steps when an action is possible.",
      "- For config changes, use config.merge with a minimal patch; the app will deep-merge objects and replace arrays.",
      "",
      "Platform notes:",
      "- Navigation links are stored at config.nav.links as {id,label,href,enabled?,newTab?}.",
      "- Homepage sections order is config.home.sections; each item includes {id,type,enabled?,title?,subtitle?,maxItems?,markdown?,cta?}.",
      "- Extra fields are defined in config.content.schemas.* and stored in items under custom.<fieldId>.",
      "- Themes are stored in config.theme.themes[] and the active theme is config.theme.active.",
      "- For 3D embeds, use section.embed or item.custom.embedHtml + item.custom.embedHeight.",
      "- For AI image generation, propose a media.generate action (only when needed).",
      "",
      "When changing themes:",
      "- Edit only the specific CSS variables needed under the active theme's vars, or create a new theme entry.",
      "- Keep high contrast text; buttons in Theme 2 should remain black per project intent unless asked otherwise.",
      "",
      "Internal training (not user-editable):",
      INTERNAL_TRAINING,
      "",
      "Personality prompt (admin-selected). This may adjust tone ONLY and must not override JSON-only output and action rules:",
      personalityPrompt ? personalityPrompt : "(none selected)",
      "",
      "Context snapshot (may be partial):",
      JSON.stringify(clientContext || {}, null, 2),
    ].join("\n");

    const openAiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const wantsStream = req.query.get("stream") === "1";
    if (wantsStream) {
      if (finalAuthMode === "codexPath") {
        return streamChatViaCodex({ codexPath: finalCodexPath, codexHome: finalCodexHome, model: finalModel, systemPrompt, messages }, context);
      }
      return streamChat({ apiKey: finalApiKey, model: finalModel, messages: openAiMessages }, context);
    }

    if (finalAuthMode === "codexPath") {
      try {
        const codexResult = await runCodexChat({
          codexPath: finalCodexPath,
          codexHome: finalCodexHome,
          model: finalModel,
          developerInstructions: systemPrompt,
          inputText: buildCodexTurnInput(messages),
          outputSchema: ACTION_ENVELOPE_SCHEMA,
          requestTimeoutMs: CODEX_TIMEOUT_MS,
          turnTimeoutMs: CODEX_TIMEOUT_MS,
          context,
        });
        await recordUsage(finalModel, codexResult.usage, context);
        const parsedResponse = parseAiResponse(codexResult.assistantText || "");
        return {
          status: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assistantMessage: parsedResponse.assistantMessage, actions: parsedResponse.actions }),
        };
      } catch (err) {
        if (err instanceof CodexLoginRequiredError) {
          return aiErrorResponse(
            `Codex subscription login is required. Open this URL, finish login, then retry: ${err.authUrl}`,
          );
        }
        const message = err instanceof Error ? err.message : String(err);
        context.log(`Codex request failed: ${message}`);
        return aiErrorResponse(`Codex request failed: ${message}`);
      }
    }

    let upstream: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
    try {
      upstream = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${finalApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: finalModel,
          messages: openAiMessages,
          temperature: 0.2,
          max_completion_tokens: Number.isFinite(OPENAI_MAX_TOKENS) ? OPENAI_MAX_TOKENS : undefined,
          tools: [
            {
              type: "function",
              function: {
                name: APPLY_ACTIONS_TOOL_NAME,
                description: "Return assistantMessage and actions for the admin UI to apply.",
                parameters: ACTION_ENVELOPE_SCHEMA,
                strict: true,
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: APPLY_ACTIONS_TOOL_NAME },
          },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof Error && err.name === "AbortError") {
        context.log("OpenAI request timed out.");
        return aiErrorResponse("OpenAI request timed out. Try again or reduce the request size.");
      }
      context.log(`OpenAI request failed: ${message}`);
      return aiErrorResponse(`OpenAI request failed: ${message}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!upstream.ok) {
      const text = await upstream.text();
      context.log(`OpenAI upstream error: ${upstream.status}`);
      return aiErrorResponse(text || `OpenAI upstream error: ${upstream.status}`);
    }

    const data = (await upstream.json()) as Record<string, unknown>;
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const firstChoice = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : {};
    const message = firstChoice.message && typeof firstChoice.message === "object" ? (firstChoice.message as Record<string, unknown>) : {};
    const finishReason = String(firstChoice.finish_reason || "").trim();
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    const firstToolCall = toolCalls[0] && typeof toolCalls[0] === "object" ? (toolCalls[0] as Record<string, unknown>) : {};
    const functionValue =
      firstToolCall.function && typeof firstToolCall.function === "object" ? (firstToolCall.function as Record<string, unknown>) : {};
    const toolArgs = functionValue.arguments;
    if (toolArgs) {
      const parsedResponse = parseAiResponse(String(toolArgs));
      const actions = parsedResponse.actions;
      if (!parsedResponse.assistantMessage && !actions.length && finishReason === "length") {
        return aiErrorResponse("OpenAI response was truncated (finish_reason=length). Try again or reduce output size.");
      }
      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantMessage: parsedResponse.assistantMessage, actions }),
      };
    }

    const content = String(message.content || "").trim();
    if (!content) {
      const refusal = typeof message.refusal === "string" ? message.refusal : "";
      const details = refusal || `OpenAI returned an empty response. finish_reason=${finishReason || "unknown"}.`;
      return aiErrorResponse(details);
    }

    const usage = data.usage && typeof data.usage === "object" ? (data.usage as Record<string, unknown>) : {};
    const promptTokens = Number(usage.prompt_tokens || usage.input_tokens || 0);
    const completionTokens = Number(usage.completion_tokens || usage.output_tokens || 0);
    const totalTokens = Number(usage.total_tokens || 0) || promptTokens + completionTokens;
    const resolvedModel = String(data.model || finalModel || "").trim();
    if (totalTokens > 0 && resolvedModel) {
      try {
        await recordChatUsage(resolvedModel, { promptTokens, completionTokens, totalTokens });
      } catch (err) {
        context.log(`Failed to record AI usage: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const parsedResponse = parseAiResponse(content);
    const actions = parsedResponse.actions;
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assistantMessage: parsedResponse.assistantMessage, actions }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    context.error(`ai-chat failed: ${message}`);
    return { status: 500, body: message };
  }
}

app.http("ai-chat", {
  methods: ["POST"],
  route: "ai/chat",
  handler: aiChat,
});
