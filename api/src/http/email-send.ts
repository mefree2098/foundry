import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";
import { EmailClient } from "@azure/communication-email";
import { ensureAdmin } from "../auth.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { getSiteConfig } from "../config.js";
import { updateEmailStats } from "../emailStats.js";
import { setMailerLiteApiKey, upsertSubscriber } from "../mailerlite.js";
import { getSubscribersContainer } from "../subscribers.js";
import { newsSchema, platformSchema, subscriberSchema, type NewsPost, type Platform, type Subscriber } from "../types/content.js";

const sendSchema = z.object({
  newsId: z.string().optional(),
  platformIds: z.array(z.string()).optional(),
  sendToAll: z.boolean().optional(),
  subject: z.string().optional(),
  html: z.string().optional(),
});

const DEFAULT_TEMPLATE = `
  <div style="font-family: Arial, sans-serif; color: #0f172a; background: #f8fafc; padding: 24px;">
    <h2 style="margin: 0 0 12px; color: #0f172a;">New update: {{newsTitle}}</h2>
    {{newsSection}}
    <p style="font-size: 12px; color: #475569; margin-top: 24px;">
      <a href="{{manageUrl}}" style="color: #0f172a; font-weight: 600;">Manage preferences</a>&nbsp;&middot;&nbsp;
      <a href="{{unsubscribeUrl}}" style="color: #ef4444; font-weight: 600;">Unsubscribe</a>
    </p>
  </div>
`;

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function hydrateTemplate(template: string, values: Record<string, string>): string {
  let output = template;
  for (const [key, val] of Object.entries(values)) {
    output = output.replaceAll(`{{${key}}}`, val);
  }
  return output;
}

function buildNewsUrl(baseUrl: string | undefined, news: NewsPost | null) {
  if (!baseUrl || !news) return "";
  return `${baseUrl.replace(/\/$/, "")}/news/${news.id}`;
}

function toParagraphs(text?: string) {
  const trimmed = (text || "").trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin: 10px 0; color:#1f2937;">${p.replaceAll("\n", "<br />")}</p>`)
    .join("");
}

function buildNewsSection(news: NewsPost | null, platforms: Platform[], newsUrl: string) {
  if (!news) return "";

  const image =
    news.imageUrl && newsUrl
      ? `<a href="${newsUrl}"><img src="${news.imageUrl}" alt="${news.imageAlt || news.title}" style="width:100%;max-width:640px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,0.12);margin: 12px 0;" /></a>`
      : "";

  const platformLine =
    platforms.length > 0
      ? `<div style="margin: 6px 0 0; color:#475569; font-size: 13px;">Related platform${platforms.length === 1 ? "" : "s"}: ${platforms
          .map((p) => p.name || p.id)
          .join(", ")}</div>`
      : "";

  const meta = [
    news.type ? `<span style="display:inline-block;margin-right:8px;">${news.type}</span>` : "",
    news.status ? `<span style="display:inline-block;margin-right:8px;">${news.status}</span>` : "",
    news.publishDate ? `<span style="display:inline-block;">${news.publishDate}</span>` : "",
  ]
    .filter(Boolean)
    .join(" &middot; ");

  const summary = news.summary ? toParagraphs(news.summary) : "";
  const content = news.content ? toParagraphs(news.content) : "";
  const links =
    news.links && Object.keys(news.links).length
      ? `<div style="margin-top: 14px;">${Object.entries(news.links)
          .filter(([, url]) => Boolean(url))
          .map(
            ([label, url]) =>
              `<a href="${url}" style="display:inline-block;padding:10px 14px;margin:6px 6px 0 0;background:#0f172a;color:#e2e8f0;text-decoration:none;border-radius:10px;font-size:13px;font-weight:600;">${label}</a>`,
          )
          .join("")}</div>`
      : "";

  const readMore = newsUrl
    ? `<p style="margin: 16px 0 0;"><a href="${newsUrl}" style="color: #0f172a; font-weight: 700;">Read the full update</a></p>`
    : "";

  return `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;margin:16px 0;">
      ${meta ? `<div style="font-size: 12px; color:#64748b; text-transform: uppercase; letter-spacing: .08em;">${meta}</div>` : ""}
      ${platformLine}
      ${image}
      ${summary}
      ${content}
      ${links}
      ${readMore}
    </div>
  `;
}

export async function sendCampaign(
  input: z.infer<typeof sendSchema>,
  context: InvocationContext,
): Promise<{ ok: boolean; campaigns: string[]; total: number; message: string }> {
  const cfg = await getSiteConfig();
  const emailSettings = cfg.emailSettings || {};

  if (emailSettings.mailerLiteApiKey) {
    setMailerLiteApiKey(emailSettings.mailerLiteApiKey);
  }

  const fromEmail = emailSettings.fromEmail || process.env.ACS_SENDER_EMAIL || "";
  if (!fromEmail) {
    throw new Error("Missing fromEmail (set Admin > Email settings or ACS_SENDER_EMAIL env var)");
  }

  const connectionString = process.env.ACS_CONNECTION_STRING || "";
  if (!connectionString) throw new Error("Missing ACS_CONNECTION_STRING");
  const emailClient = new EmailClient(connectionString);

  const batchSize = Math.min(emailSettings.batchSize ?? 490, 490);

  // Optional news lookup
  let news: NewsPost | null = null;
  if (input.newsId) {
    try {
      const { resource } = await database.container(containers.news).item(input.newsId, input.newsId).read<NewsPost>();
      if (resource) {
        const parsed = newsSchema.safeParse(resource);
        if (parsed.success) news = parsed.data;
      }
    } catch (err) {
      context.warn(`Failed to load news ${input.newsId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Resolve related platforms for template
  const platformIds = Array.isArray(news?.platformIds) ? news!.platformIds! : [];
  const platforms: Platform[] = [];
  for (const id of platformIds) {
    try {
      const { resource } = await database.container(containers.platforms).item(id, id).read<Platform>();
      if (!resource) continue;
      const parsed = platformSchema.safeParse(resource);
      if (parsed.success) platforms.push(parsed.data);
    } catch {
      // ignore
    }
  }

  // Subscriber filter
  const targetPlatformIds = input.platformIds || [];
  const sendToAll = input.sendToAll ?? targetPlatformIds.length === 0;

  const subContainer = await getSubscribersContainer();
  const { resources: rawSubs } = await subContainer.items.query("SELECT * FROM c WHERE c.status != 'unsubscribed'").fetchAll();

  const subs: Subscriber[] = [];
  for (const raw of rawSubs) {
    const parsedSub = subscriberSchema.safeParse(raw);
    if (parsedSub.success) subs.push(parsedSub.data);
  }

  const filtered = subs.filter((s) => {
    if (s.status === "unsubscribed") return false;
    if (sendToAll) return true;
    if (s.subscribeAll) return true;
    if (!s.platformIds) return false;
    return s.platformIds.some((id) => targetPlatformIds.includes(id));
  });

  if (filtered.length === 0) {
    return { ok: true, message: "No subscribers matched filter", campaigns: [], total: 0 };
  }

  const baseUrl = process.env.PUBLIC_SITE_URL || process.env.SITE_BASE_URL || "";
  const manageUrl = emailSettings.manageUrl || `${baseUrl.replace(/\/$/, "")}/subscribe`;
  const newsUrl = buildNewsUrl(baseUrl, news) || manageUrl || baseUrl || "#";
  const unsubscribeUrl = manageUrl || baseUrl || "#";

  const subject =
    input.subject ||
    emailSettings.templateSubject ||
    (news ? `Foundry update: ${news.title}` : "New update from Foundry");
  const templateHtml = input.html || emailSettings.templateHtml || DEFAULT_TEMPLATE;

  const html = hydrateTemplate(templateHtml, {
    newsTitle: news?.title || "New update",
    newsUrl,
    manageUrl,
    unsubscribeUrl,
    platformNames: platforms.map((p) => p.name || p.id).join(", "),
    newsSummary: news?.summary || "",
    newsContent: news?.content || "",
    imageUrl: news?.imageUrl || "",
    newsSection: buildNewsSection(news, platforms, newsUrl),
  });

  const chunks = chunk(filtered.map((s) => s.email), batchSize);

  const campaignIds: string[] = [];
  let totalSent = 0;

  for (let i = 0; i < chunks.length; i += 1) {
    const emails = chunks[i];

    await Promise.all(
      emails.map(async (email) => {
        try {
          await upsertSubscriber(email);
        } catch (err) {
          context.warn(`Failed to upsert subscriber ${email}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );

    const recipientList = emails.map((address) => ({ address }));
    const poller = await emailClient.beginSend({
      senderAddress: fromEmail,
      content: { subject, html },
      recipients: { to: recipientList },
      replyTo: [],
      headers: { "X-Foundry-Send": `batch-${i + 1}` },
    });
    const response = await poller.pollUntilDone();

    campaignIds.push(response?.id || `acs-${Date.now()}-${i + 1}`);
    totalSent += emails.length;
  }

  const message = `Queued ${campaignIds.length} campaign(s) across ${filtered.length} subscribers (batch size ${batchSize}).`;
  context.log(message);

  try {
    await updateEmailStats({
      totalSent,
      totalCampaigns: 1,
      lastSentAt: new Date().toISOString(),
    });
  } catch (err) {
    context.warn(`Failed to update email stats: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { ok: true, campaigns: campaignIds, total: filtered.length, message };
}

async function emailSend(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  try {
    const parsed = sendSchema.safeParse(await req.json());
    if (!parsed.success) return { status: 400, body: JSON.stringify(parsed.error.flatten()) };

    const result = await sendCampaign(parsed.data, context);
    return { status: 200, body: JSON.stringify(result) };
  } catch (err) {
    context.error(err);
    const message = err instanceof Error ? err.message : "Failed to send email";
    try {
      await updateEmailStats({
        totalFailed: 1,
        lastError: message,
        lastSentAt: new Date().toISOString(),
      });
    } catch {
      // best effort
    }
    return { status: 500, body: message };
  }
}

app.http("email-send", {
  methods: ["POST"],
  route: "email/send",
  handler: emailSend,
});
