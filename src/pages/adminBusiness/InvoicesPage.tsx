import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import BusinessSection from "./BusinessSection";
import {
  fetchBusinessCustomers,
  fetchBusinessInvoices,
  generateBusinessInvoicePdf,
  issueBusinessInvoice,
  saveBusinessInvoice,
  sendBusinessInvoice,
  voidBusinessInvoice,
} from "../../lib/api";
import { formatMinor, parseMoneyToMinor, toDateInputValue } from "../../lib/businessUi";

function InvoicesPage() {
  const queryClient = useQueryClient();
  const { data: customers = [] } = useQuery({ queryKey: ["business", "customers"], queryFn: fetchBusinessCustomers });
  const { data: invoicePage, isLoading, isError } = useQuery({ queryKey: ["business", "invoices"], queryFn: () => fetchBusinessInvoices({ limit: 100 }) });
  const invoices = invoicePage?.items || [];

  const [customerId, setCustomerId] = useState("");
  const [description, setDescription] = useState("Service retainer");
  const [amount, setAmount] = useState("0.00");
  const [dueDate, setDueDate] = useState("");
  const [taxRateBps, setTaxRateBps] = useState("0");

  const createMutation = useMutation({
    mutationFn: () =>
      saveBusinessInvoice({
        customerId,
        dueDate: dueDate || undefined,
        lines: [
          {
            description: description.trim() || "Service",
            quantity: 1,
            unitPriceMinor: parseMoneyToMinor(amount),
            taxRateBps: Number.isFinite(Number(taxRateBps)) ? Math.max(0, Math.trunc(Number(taxRateBps))) : 0,
          },
        ],
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["business", "audit"] });
      setAmount("0.00");
      setDescription("Service retainer");
      setDueDate("");
      setTaxRateBps("0");
    },
  });

  const actionMutation = useMutation({
    mutationFn: async (args: { id: string; action: "issue" | "send" | "void" | "pdf" }) => {
      if (args.action === "issue") return issueBusinessInvoice(args.id);
      if (args.action === "send") return sendBusinessInvoice(args.id);
      if (args.action === "void") return voidBusinessInvoice(args.id);
      return generateBusinessInvoicePdf(args.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["business", "audit"] });
    },
  });

  const sortedInvoices = useMemo(
    () => [...invoices].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")),
    [invoices],
  );

  const validCustomerIds = useMemo(() => new Set(customers.map((customer) => customer.id)), [customers]);

  return (
    <BusinessSection
      title="Invoices"
      summary="Draft, issue, and track invoices with deterministic totals, status transitions, and PDF generation."
    >
      <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-3 md:grid-cols-5">
        <label className="grid gap-1 md:col-span-2">
          <span className="text-xs text-slate-300">Customer</span>
          <select className="input-field" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.displayName} ({customer.id})
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-slate-300">Amount</span>
          <input className="input-field" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-slate-300">Tax (bps)</span>
          <input className="input-field" value={taxRateBps} onChange={(e) => setTaxRateBps(e.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-slate-300">Due date</span>
          <input className="input-field" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <label className="grid gap-1 md:col-span-4">
          <span className="text-xs text-slate-300">Line description</span>
          <input className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="flex items-end">
          <button
            className="btn btn-primary w-full"
            type="button"
            disabled={createMutation.status === "pending" || !customerId || !validCustomerIds.has(customerId)}
            onClick={() => void createMutation.mutateAsync()}
          >
            {createMutation.status === "pending" ? "Creating..." : "Create draft"}
          </button>
        </div>
      </div>

      {isLoading ? <div className="text-sm text-slate-300">Loading invoices...</div> : null}
      {isError ? <div className="text-sm text-red-300">Failed to load invoices.</div> : null}

      <div className="space-y-2">
        {sortedInvoices.map((invoice) => (
          <div key={invoice.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-slate-100">
                  {invoice.invoiceNumber || invoice.id} · {invoice.status.replace("_", " ")}
                </div>
                <div className="text-xs text-slate-400">
                  customer {invoice.customerId} · issue {toDateInputValue(invoice.issueDate)} · due {toDateInputValue(invoice.dueDate)}
                </div>
              </div>
              <div className="text-right text-sm text-slate-100">
                <div>Total {formatMinor(invoice.totals.totalMinor, invoice.currency)}</div>
                <div className="text-xs text-slate-400">Due {formatMinor(invoice.totals.amountDueMinor, invoice.currency)}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="btn btn-secondary"
                type="button"
                disabled={actionMutation.status === "pending" || invoice.status !== "draft"}
                onClick={() => void actionMutation.mutateAsync({ id: invoice.id, action: "issue" })}
              >
                Issue
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={actionMutation.status === "pending" || invoice.status === "void"}
                onClick={() => void actionMutation.mutateAsync({ id: invoice.id, action: "send" })}
              >
                Send
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={actionMutation.status === "pending"}
                onClick={() => void actionMutation.mutateAsync({ id: invoice.id, action: "pdf" })}
              >
                Generate PDF
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={actionMutation.status === "pending" || invoice.status === "void"}
                onClick={() => void actionMutation.mutateAsync({ id: invoice.id, action: "void" })}
              >
                Void
              </button>
              {invoice.pdf?.blobUrl ? (
                <a className="btn btn-primary" href={invoice.pdf.blobUrl} target="_blank" rel="noreferrer">
                  Open PDF
                </a>
              ) : null}
            </div>
          </div>
        ))}
        {!isLoading && sortedInvoices.length === 0 ? <div className="text-sm text-slate-400">No invoices yet.</div> : null}
      </div>
    </BusinessSection>
  );
}

export default InvoicesPage;
