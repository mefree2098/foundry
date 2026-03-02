import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import BusinessSection from "./BusinessSection";
import { fetchBusinessReport } from "../../lib/api";
import { formatMinor } from "../../lib/businessUi";

type ReportType = "pnl" | "balance-sheet" | "cash-flow" | "ar-aging" | "sales-by-customer" | "trial-balance";

function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("pnl");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [asOfDate, setAsOfDate] = useState("");

  const reportMutation = useMutation({
    mutationFn: () =>
      fetchBusinessReport(reportType, {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        asOfDate: asOfDate || undefined,
      }),
  });

  const report = reportMutation.data;

  return (
    <BusinessSection
      title="Reports"
      summary="Generate P&L, balance sheet, cash flow, AR aging, and exportable tax packet bundles."
    >
      <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-3 md:grid-cols-4">
        <select className="input-field" value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)}>
          <option value="pnl">P&L</option>
          <option value="balance-sheet">Balance Sheet</option>
          <option value="cash-flow">Cash Flow</option>
          <option value="ar-aging">AR Aging</option>
          <option value="sales-by-customer">Sales by Customer</option>
          <option value="trial-balance">Trial Balance</option>
        </select>
        <input className="input-field" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <input className="input-field" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <input className="input-field" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
      </div>

      <button className="btn btn-primary" type="button" disabled={reportMutation.status === "pending"} onClick={() => void reportMutation.mutateAsync()}>
        {reportMutation.status === "pending" ? "Generating..." : "Generate report"}
      </button>

      {reportMutation.isError ? <div className="text-sm text-red-300">Failed to generate report.</div> : null}

      {report ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">{String(report.reportType || reportType)}</div>
          <pre className="mt-2 max-h-[520px] overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-slate-200">
            {JSON.stringify(report, (_key, value) => {
              if (typeof value === "number" && Number.isInteger(value) && Math.abs(value) >= 100) {
                return {
                  minor: value,
                  formatted: formatMinor(value, typeof report.currency === "string" ? report.currency : "USD"),
                };
              }
              return value;
            }, 2)}
          </pre>
        </div>
      ) : null}
    </BusinessSection>
  );
}

export default ReportsPage;
