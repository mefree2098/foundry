import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { getBusinessConfig as loadBusinessConfig } from "../business/config.js";

async function getBusinessConfigHttp(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  try {
    const config = await loadBusinessConfig();
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    };
  } catch {
    return { status: 500, body: "Failed to load business config" };
  }
}

app.http("business-config-get", {
  methods: ["GET"],
  route: "business/config",
  handler: getBusinessConfigHttp,
});
