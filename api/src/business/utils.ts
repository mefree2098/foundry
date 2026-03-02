import { createHash, randomUUID } from "node:crypto";

export function nowIso() {
  return new Date().toISOString();
}

export function todayIsoDate() {
  return nowIso().slice(0, 10);
}

export function ensureIsoDate(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString().slice(0, 10);
}

export function addDays(dateIso: string, days: number) {
  const parsed = new Date(`${dateIso}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function makeEntityId(prefix: string) {
  const raw = randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}-${raw}`;
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    const result: Record<string, unknown> = {};
    for (const [key, child] of entries) {
      result[key] = canonicalize(child);
    }
    return result;
  }
  return value;
}

export function hashPayload(parts: Array<string | undefined | null | unknown>) {
  const normalized = parts
    .map((part) => {
      if (part == null) return "";
      if (typeof part === "string") return part;
      return JSON.stringify(canonicalize(part));
    })
    .join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function parseInteger(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(String(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}
