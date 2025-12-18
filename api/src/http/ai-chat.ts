import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { z } from "zod";
import { ensureAdmin } from "../auth.js";
import type { SiteConfig } from "../types/content.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { siteConfigSchema } from "../types/content.js";
import { recordChatUsage } from "../aiUsage.js";

const INTERNAL_TRAINING = `You are the Foundry admin assistant.

Primary goal: help the admin safely edit the site by proposing concrete actions the platform can apply.

Response rules (critical):
- Output MUST be strict JSON only: { "assistantMessage": string, "actions": AdminAiAction[] }.
- Prefer actions over explanations. If an action is possible, propose it.
- If the request is ambiguous, ask a clarifying question and return an empty actions array.
- Never include secrets (API keys, tokens) in assistantMessage or actions.

Action rules:
- Use "config.merge" for site configuration changes (themes, nav, homepage sections, custom field schemas).
- The platform deep-merges objects and REPLACES arrays. If you change an array (e.g., nav.links, home.sections, theme.themes), include the full desired array.
- Use *.upsert actions for content changes (platform/topic/news). Use *.delete only when the user explicitly asks to delete.
- Use "media.generate" when you need to create or replace an image asset.

Platform map:
- Navigation: config.nav.links[] items are { id, label, href, enabled?, newTab? }. Internal hrefs start with "/".
- Platform/news links must be a record (object) of label -> url, not an array.
- Homepage builder: config.home.sections[] controls order/visibility. Section types supported:
  - trust, ai, platforms, news, topics, newsletter, richText, cta, embed3d
  - Common fields: { id, type, enabled?, title?, subtitle?, maxItems?, markdown?, cta? }
  - 3D embeds: use section.embed with { mode: "html" | "threejs", html?, script?, height? }.
- Platform/news 3D: set item.custom.embedHtml (full HTML) and item.custom.embedHeight (px).
- Themes: config.theme.themes[] and config.theme.active.
  - Each theme has { id, name, vars } where vars is CSS variable map (e.g., "--color-bg": "#050a0a").
  - Theme intent: Theme 2 uses black background and emerald 3D panels; keep buttons black unless the user requests otherwise.
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
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  messages: z.array(messageSchema).min(1),
  context: z
    .object({
      config: z.any().optional(),
      platforms: z.any().optional(),
      topics: z.any().optional(),
      news: z.any().optional(),
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
  actions: z.array(z.any()).optional(),
});

async function aiChat(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const raw = await req.json();
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: 400, body: JSON.stringify(parsed.error.flatten()) };
  }

  const { apiKey, model, messages, context: clientContext } = parsed.data;

  let personalityPrompt: string | undefined;
  let storedOpenAiKey: string | undefined;
  let storedOpenAiModel: string | undefined;
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
    }
  } catch {
    personalityPrompt = undefined;
    storedOpenAiKey = undefined;
    storedOpenAiModel = undefined;
  }

  const finalApiKey = (apiKey || storedOpenAiKey || "").trim();
  const finalModel = (model || storedOpenAiModel || "gpt-4o-mini").trim();
  if (!finalApiKey) {
    return { status: 400, body: "OpenAI API key not configured. Save it under Admin → AI assistant settings." };
  }

  const systemPrompt = [
    "You are an admin assistant for a website CMS.",
    "You must respond in strict JSON only, matching this schema:",
    '{ "assistantMessage": string, "actions": AdminAiAction[] }',
    "",
    "AdminAiAction types:",
    '- { "type": "config.merge", "value": Partial<SiteConfig> }',
    '- { "type": "platform.upsert", "value": Platform }',
    '- { "type": "topic.upsert", "value": Topic }',
    '- { "type": "news.upsert", "value": NewsPost }',
    '- { "type": "platform.delete", "id": string }',
    '- { "type": "topic.delete", "id": string }',
    '- { "type": "news.delete", "id": string }',
    '- { "type": "media.generate", "value": { prompt, targetType, targetId?, field, size?, quality?, background? } }',
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

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${finalApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: finalModel,
      messages: openAiMessages,
      temperature: 0.2,
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    context.log(`OpenAI upstream error: ${upstream.status}`);
    return { status: 502, body: text || `Upstream error: ${upstream.status}` };
  }

  const data = (await upstream.json()) as any;
  const content = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!content) return { status: 502, body: "OpenAI returned an empty response." };

  const usage = data?.usage || {};
  const promptTokens = Number(usage.prompt_tokens || usage.input_tokens || 0);
  const completionTokens = Number(usage.completion_tokens || usage.output_tokens || 0);
  const totalTokens = Number(usage.total_tokens || 0) || promptTokens + completionTokens;
  const resolvedModel = String(data?.model || finalModel || "").trim();
  if (totalTokens > 0 && resolvedModel) {
    try {
      await recordChatUsage(resolvedModel, { promptTokens, completionTokens, totalTokens });
    } catch (err) {
      context.log(`Failed to record AI usage: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assistantMessage: content, actions: [] }),
    };
  }

  const validated = responseSchema.safeParse(json);
  if (!validated.success) {
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assistantMessage: content, actions: [] }),
    };
  }

  const actions = (validated.data.actions || []) as AdminAiAction[];
  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assistantMessage: validated.data.assistantMessage, actions }),
  };
}

app.http("ai-chat", {
  methods: ["POST"],
  route: "ai/chat",
  handler: aiChat,
});
