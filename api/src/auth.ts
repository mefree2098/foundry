import type { HttpRequest } from "@azure/functions";

type ClientPrincipal = {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
};

export function getClientPrincipal(req: HttpRequest): ClientPrincipal | null {
  const encoded = req.headers.get("x-ms-client-principal");
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    return JSON.parse(decoded) as ClientPrincipal;
  } catch {
    return null;
  }
}

export function ensureAdmin(req: HttpRequest): { ok: true } | { ok: false; status: number; body: string } {
  const principal = getClientPrincipal(req);
  if (!principal) {
    return { ok: false, status: 401, body: "Unauthorized" };
  }
  const roles = principal.userRoles || [];
  if (!roles.includes("administrator")) {
    return { ok: false, status: 403, body: "Forbidden" };
  }
  return { ok: true };
}
