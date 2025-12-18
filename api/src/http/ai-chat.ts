import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { z } from "zod";
import { ensureAdmin } from "../auth.js";
import type { SiteConfig } from "../types/content.js";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

const requestSchema = z.object({
  apiKey: z.string().min(1),
  model: z.string().min(1),
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
  | { type: "news.delete"; id: string };

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
    "",
    "Rules:",
    "- Keep actions minimal and safe.",
    "- Do not include secrets in outputs.",
    "- If the request is ambiguous, ask a clarifying question in assistantMessage and return no actions.",
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
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
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
