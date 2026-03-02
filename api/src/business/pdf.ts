import { createHash } from "node:crypto";
import type { BusinessInvoice } from "./schemas.js";

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildSinglePagePdf(textLines: string[]): Buffer {
  const contentParts: string[] = [];
  let y = 760;
  for (const line of textLines) {
    if (y < 40) break;
    contentParts.push(`BT /F1 11 Tf 48 ${y} Td (${escapePdfText(line)}) Tj ET`);
    y -= 16;
  }

  const contentStream = contentParts.join("\n");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${Buffer.byteLength(contentStream, "utf8")} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

export function renderInvoicePdf(invoice: BusinessInvoice, customerName: string) {
  const lines = [
    `Invoice ${invoice.invoiceNumber || invoice.id}`,
    `Status: ${invoice.status}`,
    `Customer: ${customerName}`,
    `Issue Date: ${invoice.issueDate}`,
    `Due Date: ${invoice.dueDate}`,
    `Currency: ${invoice.currency}`,
    "",
    "Items:",
    ...invoice.lines.map(
      (line, index) =>
        `${index + 1}. ${line.description} x${line.quantity} @ ${(line.unitPriceMinor / 100).toFixed(2)} | line total ${(line.totalMinor / 100).toFixed(2)}`,
    ),
    "",
    `Subtotal: ${(invoice.totals.subtotalMinor / 100).toFixed(2)}`,
    `Discount: ${(invoice.totals.discountTotalMinor / 100).toFixed(2)}`,
    `Tax: ${(invoice.totals.taxTotalMinor / 100).toFixed(2)}`,
    `Total: ${(invoice.totals.totalMinor / 100).toFixed(2)}`,
    `Paid: ${(invoice.totals.amountPaidMinor / 100).toFixed(2)}`,
    `Due: ${(invoice.totals.amountDueMinor / 100).toFixed(2)}`,
  ];

  const buffer = buildSinglePagePdf(lines);
  const contentHash = createHash("sha256").update(buffer).digest("hex");
  return {
    buffer,
    contentHash,
  };
}
