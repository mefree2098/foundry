import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { getSasForBlob } from "../storage.js";

app.http("media-sas", {
  methods: ["POST"],
  route: "media/sas",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = ensureAdmin(req);
    if (!auth.ok) return { status: auth.status, body: auth.body };

    const body = (await req.json().catch(() => ({}))) as Partial<{ filename: string; contentType: string }>;
    if (!body.filename) return { status: 400, body: "filename is required" };

    try {
      const sas = await getSasForBlob(body.filename, body.contentType || "application/octet-stream");
      context.log(`Issued SAS for upload: ${sas.blobUrl}`);
      return { status: 200, jsonBody: sas };
    } catch (err) {
      context.error(err);
      const message = err instanceof Error ? err.message : "Failed to generate SAS URL";
      return { status: 500, body: message };
    }
  },
});
