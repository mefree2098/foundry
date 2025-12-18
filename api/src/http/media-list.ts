import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { listMediaBlobs } from "../storage.js";

async function mediaList(req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const url = new URL(req.url);
  const prefix = url.searchParams.get("prefix") || undefined;
  const continuationToken = url.searchParams.get("continuationToken") || undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  const result = await listMediaBlobs({ prefix, continuationToken, limit });
  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  };
}

app.http("media-list", {
  methods: ["GET"],
  route: "media/list",
  handler: mediaList,
});
