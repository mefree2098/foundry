import BusinessSection from "./BusinessSection";
import { useBusinessAudit } from "../../hooks/useBusinessAudit";
import { useBusinessConfig } from "../../hooks/useBusinessConfig";
import { useBusinessCustomers } from "../../hooks/useBusinessCustomers";
import { useQuery } from "@tanstack/react-query";
import { fetchBusinessInvariants, fetchBusinessInvoices } from "../../lib/api";

function OverviewPage() {
  const { data: config, isLoading: loadingConfig } = useBusinessConfig();
  const { data: customers = [], isLoading: loadingCustomers } = useBusinessCustomers();
  const { data: audit, isLoading: loadingAudit } = useBusinessAudit(10);
  const { data: invoicesPage, isLoading: loadingInvoices } = useQuery({
    queryKey: ["business", "invoices", "overview"],
    queryFn: () => fetchBusinessInvoices({ limit: 200 }),
  });
  const { data: invariants, isLoading: loadingInvariants } = useQuery({
    queryKey: ["business", "invariants"],
    queryFn: fetchBusinessInvariants,
  });

  const lastAudit = audit?.items?.[0];
  const invoices = invoicesPage?.items || [];
  const openInvoices = invoices.filter((invoice) => invoice.status !== "paid" && invoice.status !== "void");

  return (
    <BusinessSection
      title="Business Overview"
      summary="This workspace is the foundation for invoicing, customers, banking, reconciliation, and reporting."
    >
      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Base Currency</div>
          <div className="mt-1 text-lg font-semibold text-slate-100">{loadingConfig ? "Loading..." : config?.baseCurrency || "USD"}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Customers</div>
          <div className="mt-1 text-lg font-semibold text-slate-100">{loadingCustomers ? "Loading..." : customers.length}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Recent Audit</div>
          <div className="mt-1 text-sm text-slate-100">{loadingAudit ? "Loading..." : lastAudit ? lastAudit.actionType : "No events yet"}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Open Invoices</div>
          <div className="mt-1 text-lg font-semibold text-slate-100">{loadingInvoices ? "Loading..." : openInvoices.length}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Invariant Checks</div>
          <div className={`mt-1 text-sm ${invariants?.ok ? "text-emerald-200" : "text-red-300"}`}>
            {loadingInvariants ? "Loading..." : invariants?.ok ? "Pass" : "Issues"}
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-emerald-100">
        Business shell and initial config/customers/audit wiring are active.
      </div>
    </BusinessSection>
  );
}

export default OverviewPage;
