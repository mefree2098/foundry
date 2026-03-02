import { useQuery } from "@tanstack/react-query";
import BusinessSection from "./BusinessSection";
import { fetchBusinessLedger } from "../../lib/api";
import { formatMinor } from "../../lib/businessUi";

function LedgerPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["business", "ledger"],
    queryFn: () => fetchBusinessLedger({ limit: 150, trialBalance: true }),
  });

  const entries = data?.entries || [];
  const trialBalance = data?.trialBalance;

  return (
    <BusinessSection
      title="Ledger"
      summary="Review chart-of-accounts activity and journal entries with immutable posting and reversal-first corrections."
    >
      {isLoading ? <div className="text-sm text-slate-300">Loading ledger...</div> : null}
      {isError ? <div className="text-sm text-red-300">Failed to load ledger data.</div> : null}

      {trialBalance ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Trial Balance</div>
          <div className={`mt-2 text-sm ${trialBalance.balanced ? "text-emerald-200" : "text-red-300"}`}>
            {trialBalance.balanced ? "Balanced" : "Out of balance"} · delta {trialBalance.total}
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {Object.entries(trialBalance.byAccount)
              .slice(0, 20)
              .map(([accountId, balance]) => (
                <div key={accountId} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200">
                  {accountId}: {formatMinor(balance)}
                </div>
              ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">Journal Entries</div>
        <div className="mt-2 space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200">
              <div className="font-semibold text-slate-100">
                {entry.postedDate} · {entry.memo}
              </div>
              <div className="text-slate-400">
                {entry.id} · {entry.source}
                {entry.reversalOf ? ` · reversal of ${entry.reversalOf}` : ""}
              </div>
              <div className="mt-1 grid gap-1">
                {entry.lines.map((line, index) => (
                  <div key={`${entry.id}-${index}`} className="text-slate-300">
                    {line.accountId}: debit {formatMinor(line.debitMinor, line.currency)} / credit {formatMinor(line.creditMinor, line.currency)}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!isLoading && entries.length === 0 ? <div className="text-sm text-slate-400">No journal entries posted yet.</div> : null}
        </div>
      </div>
    </BusinessSection>
  );
}

export default LedgerPage;
