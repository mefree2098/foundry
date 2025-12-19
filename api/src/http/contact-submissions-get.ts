import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { database } from "../client.js";
import { containers } from "../cosmos.js";

async function getContactSubmissions(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const limitParam = req.query.get("limit");
  const limit = Math.min(Math.max(Number(limitParam || 50), 1), 200);

  const container = database.container(containers.contactSubmissions);
  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit",
      parameters: [{ name: "@limit", value: limit }],
    })
    .fetchAll();

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(resources || []),
  };
}

app.http("contact-submissions-get", {
  methods: ["GET"],
  route: "contact/submissions",
  handler: getContactSubmissions,
});
