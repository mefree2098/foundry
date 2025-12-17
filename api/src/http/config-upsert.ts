import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { siteConfigSchema, type SiteConfig } from "../types/content.js";

async function upsertConfig(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const payload = await req.json();
  const parsed = siteConfigSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 400, body: JSON.stringify(parsed.error.flatten()) };
  }
  const config = parsed.data;
  const id = config.id || "global";
  const container = database.container(containers.config);

  let existing: Partial<SiteConfig> | null = null;
  try {
    const read = await container.item(id, id).read();
    existing = (read.resource as Partial<SiteConfig> | undefined) || null;
  } catch {
    existing = null;
  }

  // Preserve MailerLite API key unless a new one is provided
  const hasNewKey = Boolean(config.emailSettings?.mailerLiteApiKey);
  const existingKey = existing?.emailSettings?.mailerLiteApiKey;
  const mergedEmailSettings = {
    ...(existing?.emailSettings || {}),
    ...(config.emailSettings || {}),
    ...(hasNewKey ? {} : { mailerLiteApiKey: existingKey }),
  };
  if (mergedEmailSettings.mailerLiteApiKey) {
    mergedEmailSettings.hasMailerLiteApiKey = true;
  }

  const nextConfig = {
    ...existing,
    ...config,
    id,
    emailSettings: mergedEmailSettings,
  };

  await container.items.upsert(nextConfig);
  context.log(`Upserted site config ${id}`);

  const safeResponse = {
    ...nextConfig,
    emailSettings: {
      ...nextConfig.emailSettings,
      mailerLiteApiKey: undefined,
      hasMailerLiteApiKey: Boolean(nextConfig.emailSettings?.mailerLiteApiKey || nextConfig.emailSettings?.hasMailerLiteApiKey),
    },
  };

  return { status: 200, body: JSON.stringify(safeResponse) };
}

app.http("config-upsert", {
  methods: ["POST", "PUT"],
  route: "config/{id?}",
  handler: upsertConfig,
});
