import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import BusinessSection from "./BusinessSection";
import { fetchBusinessBankAccounts, fetchBusinessReconcileStatus, runBusinessReconcile } from "../../lib/api";

function ReconcilePage() {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useQuery({ queryKey: ["business", "bank", "accounts"], queryFn: fetchBusinessBankAccounts });
  const [bankAccountId, setBankAccountId] = useState("");
  const [throughDate, setThroughDate] = useState("");
  const [applyMatches, setApplyMatches] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["business", "reconcile", "status", { bankAccountId }],
    queryFn: () => fetchBusinessReconcileStatus({ bankAccountId: bankAccountId || undefined }),
    enabled: Boolean(bankAccountId),
    retry: false,
  });

  const runMutation = useMutation({
    mutationFn: () =>
      runBusinessReconcile({
        bankAccountId,
        throughDate: throughDate || undefined,
        apply: applyMatches,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "reconcile", "status"] });
      await queryClient.invalidateQueries({ queryKey: ["business", "bank", "transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["business", "audit"] });
    },
  });

  const selectedAccount = useMemo(() => accounts.find((account) => account.id === bankAccountId), [accounts, bankAccountId]);
  const run = runMutation.data || statusQuery.data;

  return (
    <BusinessSection
      title="Reconcile"
      summary="Match bank transactions to ledger entries, resolve exceptions, and lock period balances after review."
    >
      <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-3 md:grid-cols-4">
        <select className="input-field md:col-span-2" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
          <option value="">Select bank account</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.displayName} ({account.id})
            </option>
          ))}
        </select>
        <input className="input-field" type="date" value={throughDate} onChange={(e) => setThroughDate(e.target.value)} />
        <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-200">
          <input type="checkbox" checked={applyMatches} onChange={(e) => setApplyMatches(e.target.checked)} />
          Apply matches
        </label>
      </div>

      <button className="btn btn-primary" type="button" disabled={runMutation.status === "pending" || !bankAccountId} onClick={() => void runMutation.mutateAsync()}>
        {runMutation.status === "pending" ? "Running..." : "Run reconciliation"}
      </button>

      {selectedAccount ? (
        <div className="text-xs text-slate-400">Using cash ledger account: {selectedAccount.ledgerCashAccountId}</div>
      ) : null}

      {statusQuery.isError && !runMutation.data ? <div className="text-sm text-slate-400">No previous run found for this account.</div> : null}

      {run ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Latest reconcile run</div>
          <div className="mt-1 text-sm text-slate-100">
            {run.id} · {run.status} · through {run.throughDate}
          </div>
          <div className="text-xs text-slate-400">
            reviewed {run.summary.reviewed} / reconciled {run.summary.reconciled} / unmatched {run.summary.unmatched}
          </div>
          <div className="mt-2 space-y-2">
            {run.suggestions.slice(0, 30).map((suggestion) => (
              <div key={`${run.id}-${suggestion.bankTransactionId}`} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200">
                <div className="font-semibold text-slate-100">
                  tx {suggestion.bankTransactionId}
                  {suggestion.journalEntryId ? ` -> ${suggestion.journalEntryId}` : " (no match)"}
                </div>
                <div className="text-slate-400">
                  confidence {Math.round(suggestion.confidence * 100)}% · {suggestion.reason}
                </div>
              </div>
            ))}
            {run.suggestions.length === 0 ? <div className="text-sm text-slate-400">No reconciliation suggestions returned.</div> : null}
          </div>
        </div>
      ) : null}
    </BusinessSection>
  );
}

export default ReconcilePage;
