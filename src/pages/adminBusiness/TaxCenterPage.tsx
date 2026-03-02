import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import BusinessSection from "./BusinessSection";
import { fetchBusinessInvariants, fetchBusinessReport } from "../../lib/api";

function TaxCenterPage() {
  const invariants = useQuery({ queryKey: ["business", "invariants"], queryFn: fetchBusinessInvariants });
  const [packetUrl, setPacketUrl] = useState<string | null>(null);

  const packetMutation = useMutation({
    mutationFn: async () => {
      const [pnl, balanceSheet, cashFlow, arAging, trialBalance] = await Promise.all([
        fetchBusinessReport("pnl"),
        fetchBusinessReport("balance-sheet"),
        fetchBusinessReport("cash-flow"),
        fetchBusinessReport("ar-aging"),
        fetchBusinessReport("trial-balance"),
      ]);
      return {
        generatedAt: new Date().toISOString(),
        reports: {
          pnl,
          balanceSheet,
          cashFlow,
          arAging,
          trialBalance,
        },
      };
    },
    onSuccess: (packet) => {
      if (packetUrl) URL.revokeObjectURL(packetUrl);
      const blob = new Blob([JSON.stringify(packet, null, 2)], { type: "application/json" });
      setPacketUrl(URL.createObjectURL(blob));
    },
  });

  return (
    <BusinessSection
      title="Tax Center"
      summary="Prepare tax-ready exports from categorized ledger data, source artifacts, and reconciliation checkpoints."
    >
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">Invariant checks</div>
        {invariants.isLoading ? <div className="mt-2 text-sm text-slate-300">Running checks...</div> : null}
        {invariants.isError ? <div className="mt-2 text-sm text-red-300">Failed to run invariants check.</div> : null}
        {invariants.data ? (
          <div className="mt-2 text-sm">
            <div className={invariants.data.ok ? "text-emerald-200" : "text-red-300"}>
              {invariants.data.ok ? "All invariants passed." : "Invariant issues found."}
            </div>
            <div className="text-xs text-slate-400">Checked at {invariants.data.checkedAt}</div>
            {invariants.data.issues.length ? (
              <div className="mt-2 space-y-1 text-xs text-red-200">
                {invariants.data.issues.map((issue) => (
                  <div key={issue}>- {issue}</div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">Tax packet export</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn btn-primary" type="button" disabled={packetMutation.status === "pending"} onClick={() => void packetMutation.mutateAsync()}>
            {packetMutation.status === "pending" ? "Building packet..." : "Build tax packet"}
          </button>
          {packetUrl ? (
            <a className="btn btn-secondary" href={packetUrl} download={`tax-packet-${new Date().toISOString().slice(0, 10)}.json`}>
              Download packet
            </a>
          ) : null}
        </div>
      </div>
    </BusinessSection>
  );
}

export default TaxCenterPage;
