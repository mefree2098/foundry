import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { z } from "zod";
import { EmailClient } from "@azure/communication-email";
import { database } from "../client.js";
import { containers } from "../cosmos.js";
import { getSiteConfig } from "../config.js";

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  subject: z.string().max(200).optional(),
  message: z.string().min(1).max(5000),
  company: z.string().max(200).optional(),
  phone: z.string().max(100).optional(),
  pageUrl: z.string().url().optional(),
});

type ContactSubmission = z.infer<typeof contactSchema> & {
  id: string;
  createdAt: string;
  status: "new" | "sent" | "failed";
};

function applyTemplate(template: string, data: Record<string, string>) {
  let output = template;
  for (const [key, value] of Object.entries(data)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }
  return output;
}

function buildHtml(submission: ContactSubmission) {
  const safe = (value?: string) => (value ? value.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "");
  return `
    <div style="font-family: Arial, sans-serif; color: #0f172a; background: #f8fafc; padding: 24px;">
      <h2 style="margin: 0 0 12px; color: #0f172a;">New contact request</h2>
      <p style="margin: 4px 0;"><strong>Name:</strong> ${safe(submission.name)}</p>
      <p style="margin: 4px 0;"><strong>Email:</strong> ${safe(submission.email)}</p>
      ${submission.company ? `<p style="margin: 4px 0;"><strong>Company:</strong> ${safe(submission.company)}</p>` : ""}
      ${submission.phone ? `<p style="margin: 4px 0;"><strong>Phone:</strong> ${safe(submission.phone)}</p>` : ""}
      ${submission.subject ? `<p style="margin: 4px 0;"><strong>Subject:</strong> ${safe(submission.subject)}</p>` : ""}
      ${submission.pageUrl ? `<p style="margin: 4px 0;"><strong>Page:</strong> ${safe(submission.pageUrl)}</p>` : ""}
      <div style="margin-top: 16px; padding: 12px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #64748b;">Message</div>
        <p style="margin-top: 8px; color: #1f2937; white-space: pre-line;">${safe(submission.message)}</p>
      </div>
    </div>
  `;
}

function makeId() {
  return `contact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function contactSubmit(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const raw = await req.json();
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) return { status: 400, body: JSON.stringify(parsed.error.flatten()) };

  const config = await getSiteConfig();
  const contactSettings = config.contact || {};
  if (!contactSettings.enabled) {
    return { status: 400, body: "Contact form is disabled." };
  }

  const recipientEmail = (contactSettings.recipientEmail || "").trim();
  if (!recipientEmail) {
    return { status: 400, body: "Contact recipient email is not configured." };
  }

  const fromEmail = config.emailSettings?.fromEmail || process.env.ACS_SENDER_EMAIL || "";
  if (!fromEmail) {
    return { status: 500, body: "Missing fromEmail (set Admin > Email settings or ACS_SENDER_EMAIL)." };
  }

  const connectionString = process.env.ACS_CONNECTION_STRING || "";
  if (!connectionString) return { status: 500, body: "Missing ACS_CONNECTION_STRING" };

  const submission: ContactSubmission = {
    ...parsed.data,
    id: makeId(),
    createdAt: new Date().toISOString(),
    status: "new",
  };

  const subjectTemplate = contactSettings.subjectTemplate || "Contact form: {{subject}}";
  const subject = applyTemplate(subjectTemplate, {
    name: submission.name,
    email: submission.email,
    subject: submission.subject || "New message",
  });

  const container = database.container(containers.contactSubmissions);
  await container.items.upsert(submission);

  const emailClient = new EmailClient(connectionString);
  try {
    const poller = await emailClient.beginSend({
      senderAddress: fromEmail,
      content: { subject, html: buildHtml(submission) },
      recipients: { to: [{ address: recipientEmail }] },
      replyTo: [{ address: submission.email, displayName: submission.name }],
      headers: { "X-Foundry-Contact": submission.id },
    });
    await poller.pollUntilDone();
    await container.item(submission.id, submission.id).replace({ ...submission, status: "sent" });
  } catch (err) {
    context.error(err);
    await container.item(submission.id, submission.id).replace({ ...submission, status: "failed" });
    return { status: 502, body: "Failed to send contact email." };
  }

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, id: submission.id }),
  };
}

app.http("contact-submit", {
  methods: ["POST"],
  route: "contact",
  handler: contactSubmit,
});
