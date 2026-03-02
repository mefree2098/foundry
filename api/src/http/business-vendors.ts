import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ensureAdmin } from "../auth.js";
import { recordBusinessAuditEvent } from "../business/audit.js";
import { deleteVendor, getVendorById, listVendors, upsertVendor } from "../business/vendors.js";

async function getBusinessVendors(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const vendors = await listVendors();
  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vendors),
  };
}

async function postBusinessVendor(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const payload = await req.json();
  const id = typeof (payload as { id?: unknown })?.id === "string" ? String((payload as { id?: string }).id).toLowerCase() : "";
  const before = id ? await getVendorById(id) : undefined;

  try {
    const vendor = await upsertVendor(payload);
    await recordBusinessAuditEvent(req, {
      source: "ui",
      actionType: "business.vendor.upsert",
      entityRef: { type: "vendor", id: vendor.id },
      before,
      after: vendor,
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vendor),
    };
  } catch (error) {
    return { status: 400, body: error instanceof Error ? error.message : "Failed to save vendor" };
  }
}

async function getBusinessVendor(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const id = decodeURIComponent((req.params["id"] || "").trim().toLowerCase());
  if (!id) return { status: 400, body: "Missing id" };

  const vendor = await getVendorById(id);
  if (!vendor) return { status: 404, body: "Vendor not found" };

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vendor),
  };
}

async function deleteBusinessVendor(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = ensureAdmin(req);
  if (!auth.ok) return { status: auth.status, body: auth.body };

  const id = decodeURIComponent((req.params["id"] || "").trim().toLowerCase());
  if (!id) return { status: 400, body: "Missing id" };

  const before = await getVendorById(id);
  if (!before) return { status: 404, body: "Vendor not found" };

  await deleteVendor(id);

  await recordBusinessAuditEvent(req, {
    source: "ui",
    actionType: "business.vendor.delete",
    entityRef: { type: "vendor", id },
    before,
  });

  return { status: 204 };
}

app.http("business-vendors-get", {
  methods: ["GET"],
  route: "business/vendors",
  handler: getBusinessVendors,
});

app.http("business-vendors-post", {
  methods: ["POST", "PUT"],
  route: "business/vendors/{id?}",
  handler: postBusinessVendor,
});

app.http("business-vendor-get", {
  methods: ["GET"],
  route: "business/vendors/{id}",
  handler: getBusinessVendor,
});

app.http("business-vendor-delete", {
  methods: ["DELETE"],
  route: "business/vendors/{id}",
  handler: deleteBusinessVendor,
});
