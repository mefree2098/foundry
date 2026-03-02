import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import BusinessSection from "./BusinessSection";
import {
  fetchBusinessBankAccounts,
  fetchBusinessBankTransactions,
  importBusinessBankTransactions,
  saveBusinessBankAccount,
} from "../../lib/api";
import { formatMinor } from "../../lib/businessUi";

function BankingPage() {
  const queryClient = useQueryClient();
  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({ queryKey: ["business", "bank", "accounts"], queryFn: fetchBusinessBankAccounts });
  const { data: txPage, isLoading: loadingTx } = useQuery({ queryKey: ["business", "bank", "transactions"], queryFn: () => fetchBusinessBankTransactions({ limit: 100 }) });
  const transactions = txPage?.items || [];

  const [accountName, setAccountName] = useState("");
  const [institution, setInstitution] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [importAccountId, setImportAccountId] = useState("");
  const [importRowsText, setImportRowsText] = useState("2026-01-15,Steam payout,120000\n2026-01-16,Bank fee,-350");

  const saveAccount = useMutation({
    mutationFn: () =>
      saveBusinessBankAccount({
        displayName: accountName.trim(),
        institution: institution.trim() || undefined,
        currency: currency.trim().toUpperCase() || "USD",
        feedType: "manual",
        connectionState: "connected",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "bank", "accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["business", "audit"] });
      setAccountName("");
      setInstitution("");
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const rows = importRowsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => {
          const [postedDate, description, amount] = line.split(",").map((chunk) => chunk.trim());
          return {
            postedDate,
            description: description || `Imported transaction ${index + 1}`,
            amountMinor: Number(amount || "0"),
            currency: accounts.find((account) => account.id === importAccountId)?.currency || "USD",
            sourceRef: `manual-${index + 1}`,
          };
        });

      return importBusinessBankTransactions({
        bankAccountId: importAccountId,
        source: "manual",
        transactions: rows,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "bank", "transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["business", "bank", "accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["business", "audit"] });
    },
  });

  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [accounts],
  );

  return (
    <BusinessSection
      title="Banking"
      summary="Connect feeds or upload statements, then normalize, deduplicate, and prepare transactions for reconciliation."
    >
      <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-3 md:grid-cols-4">
        <input className="input-field" placeholder="Account name" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
        <input className="input-field" placeholder="Institution" value={institution} onChange={(e) => setInstitution(e.target.value)} />
        <input className="input-field" placeholder="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        <button
          className="btn btn-primary"
          type="button"
          disabled={saveAccount.status === "pending" || !accountName.trim()}
          onClick={() => void saveAccount.mutateAsync()}
        >
          {saveAccount.status === "pending" ? "Saving..." : "Add account"}
        </button>
      </div>

      <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">Manual transaction import</div>
        <div className="grid gap-3 md:grid-cols-4">
          <select className="input-field md:col-span-1" value={importAccountId} onChange={(e) => setImportAccountId(e.target.value)}>
            <option value="">Select bank account</option>
            {sortedAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.displayName}
              </option>
            ))}
          </select>
          <textarea
            className="input-field md:col-span-3 min-h-[100px]"
            value={importRowsText}
            onChange={(e) => setImportRowsText(e.target.value)}
            placeholder="YYYY-MM-DD,Description,AmountMinor"
          />
        </div>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={importMutation.status === "pending" || !importAccountId || !importRowsText.trim()}
          onClick={() => void importMutation.mutateAsync()}
        >
          {importMutation.status === "pending" ? "Importing..." : "Import transactions"}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Bank accounts</div>
          {loadingAccounts ? <div className="mt-2 text-sm text-slate-300">Loading accounts...</div> : null}
          <div className="mt-2 space-y-2">
            {sortedAccounts.map((account) => (
              <div key={account.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200">
                <div className="font-semibold text-slate-100">{account.displayName}</div>
                <div className="text-slate-400">
                  {account.id} · {account.currency} · {account.feedType} · {account.connectionState}
                </div>
              </div>
            ))}
            {!loadingAccounts && sortedAccounts.length === 0 ? <div className="text-sm text-slate-400">No bank accounts yet.</div> : null}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Latest bank transactions</div>
          {loadingTx ? <div className="mt-2 text-sm text-slate-300">Loading transactions...</div> : null}
          <div className="mt-2 space-y-2">
            {transactions.slice(0, 20).map((tx) => (
              <div key={tx.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200">
                <div className="font-semibold text-slate-100">{tx.description}</div>
                <div className="text-slate-400">
                  {tx.postedDate} · {tx.status} · {formatMinor(tx.amountMinor, tx.currency)}
                </div>
              </div>
            ))}
            {!loadingTx && transactions.length === 0 ? <div className="text-sm text-slate-400">No transactions imported yet.</div> : null}
          </div>
        </div>
      </div>
    </BusinessSection>
  );
}

export default BankingPage;
