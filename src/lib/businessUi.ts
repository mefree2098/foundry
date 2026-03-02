export function formatMinor(amountMinor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((amountMinor || 0) / 100);
}

export function parseMoneyToMinor(input: string) {
  const normalized = input.replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function toDateInputValue(value?: string) {
  if (!value) return "";
  return value.slice(0, 10);
}
