import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { z } from "zod";
import { ensureAdmin } from "../auth.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { siteConfigSchema } from "../types/content.js";
import { uploadBase64Image } from "../storage.js";
import { recordImageUsage } from "../aiUsage.js";

const requestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  size: z.string().optional(),
  quality: z.enum(["low", "medium", "high", "auto"]).optional(),
  background: z.enum(["transparent", "opaque", "auto"]).optional(),
  outputFormat: z.enum(["png", "jpeg", "webp"]).optional(),
  filenameHint: z.string().optional(),
});

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extensionFor(format: string) {
  if (format === "jpeg") return "jpg";
  return format;
}

async function imageGenerate(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const raw = await req.json();
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: 400, body: JSON.stringify(parsed.error.flatten()) };
  }

  const { prompt, model, size, quality, background, outputFormat, filenameHint } = parsed.data;

  let storedApiKey: string | undefined;
  let storedImageModel: string | undefined;
  let storedSize: string | undefined;
  let storedQuality: string | undefined;
  let storedBackground: string | undefined;
  let storedFormat: string | undefined;

  try {
    const container = database.container(containers.config);
    const id = "global";
    const { resource } = await container.item(id, id).read();
    const configParsed = siteConfigSchema.safeParse(resource || {});
    if (configParsed.success) {
      const openai = configParsed.data.ai?.adminAssistant?.openai;
      storedApiKey = openai?.apiKey;
      storedImageModel = openai?.imageModel;
      storedSize = openai?.imageSize;
      storedQuality = openai?.imageQuality;
      storedBackground = openai?.imageBackground;
      storedFormat = openai?.imageOutputFormat;
    }
  } catch {
    storedApiKey = undefined;
  }

  const finalApiKey = (storedApiKey || "").trim();
  if (!finalApiKey) {
    return { status: 400, body: "OpenAI API key not configured. Save it under Admin > AI assistant settings." };
  }

  const finalModel = (model || storedImageModel || "gpt-image-1.5").trim();
  const finalSize = (size || storedSize || "1024x1024").trim();
  const finalQuality = (quality || storedQuality || "auto").trim();
  const finalBackground = (background || storedBackground || "auto").trim();
  const finalFormat = (outputFormat || storedFormat || "png").trim();

  const upstream = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${finalApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: finalModel,
      prompt,
      n: 1,
      size: finalSize,
      quality: finalQuality,
      background: finalBackground,
      output_format: finalFormat,
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    context.log(`OpenAI image generation error: ${upstream.status}`);
    return { status: 502, body: text || `Upstream error: ${upstream.status}` };
  }

  const data = (await upstream.json()) as any;
  const imageBase64 = data?.data?.[0]?.b64_json;
  if (!imageBase64) {
    return { status: 502, body: "OpenAI returned no image data." };
  }

  const usage = data?.usage || {};
  const promptTokens = Number(usage.input_tokens || usage.prompt_tokens || 0);
  const completionTokens = Number(usage.output_tokens || usage.completion_tokens || 0);
  const totalTokens = Number(usage.total_tokens || usage.totalTokens || 0) || promptTokens + completionTokens;

  const baseName = slugify(filenameHint || prompt.slice(0, 64)) || "ai-image";
  const fileName = `${baseName}.${extensionFor(finalFormat)}`;
  const contentType = finalFormat === "webp" ? "image/webp" : finalFormat === "jpeg" ? "image/jpeg" : "image/png";
  const stored = await uploadBase64Image({ filename: fileName, base64: imageBase64, contentType });

  try {
    await recordImageUsage(finalModel, { promptTokens, completionTokens, totalTokens });
  } catch (err) {
    context.log(`Failed to record image usage: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blobUrl: stored.blobUrl,
      name: stored.name,
      model: finalModel,
      usage: { promptTokens, completionTokens, totalTokens },
    }),
  };
}

app.http("image-generate", {
  methods: ["POST"],
  route: "ai/image-generate",
  handler: imageGenerate,
});
