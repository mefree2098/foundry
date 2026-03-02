import BusinessSection from "./BusinessSection";
import { useMemo, useState } from "react";
import { useBusinessCustomers } from "../../hooks/useBusinessCustomers";

function CustomersPage() {
  const { data: customers = [], isLoading, isError, saveCustomer, removeCustomer, saveStatus, deleteStatus } = useBusinessCustomers();
  const [id, setId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [terms, setTerms] = useState("30");

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "")),
    [customers],
  );

  const handleCreate = async () => {
    const trimmedId = id.trim().toLowerCase();
    const trimmedName = displayName.trim();
    if (!trimmedId || !trimmedName) return;
    await saveCustomer({
      id: trimmedId,
      displayName: trimmedName,
      emails: email.trim() ? [email.trim()] : [],
      defaultTermsDays: Number.isFinite(Number(terms)) ? Number(terms) : 30,
      status: "active",
    });
    setId("");
    setDisplayName("");
    setEmail("");
    setTerms("30");
  };

  return (
    <BusinessSection
      title="Customers"
      summary="Manage customer profiles, billing contacts, terms, and tax metadata used by invoices and collections."
    >
      <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-3 md:grid-cols-4">
        <input className="input-field" placeholder="id (acme-co)" value={id} onChange={(e) => setId(e.target.value)} />
        <input className="input-field" placeholder="display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <input className="input-field" placeholder="billing email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="flex gap-2">
          <input className="input-field" placeholder="terms days" value={terms} onChange={(e) => setTerms(e.target.value)} />
          <button className="btn btn-primary shrink-0" type="button" onClick={handleCreate} disabled={saveStatus === "pending"}>
            {saveStatus === "pending" ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {isLoading ? <div className="text-sm text-slate-300">Loading customers...</div> : null}
      {isError ? <div className="text-sm text-red-300">Failed to load customers.</div> : null}

      <div className="space-y-2">
        {sortedCustomers.map((customer) => (
          <div key={customer.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div>
              <div className="font-medium text-slate-100">{customer.displayName}</div>
              <div className="text-xs text-slate-400">
                {customer.id} · {customer.preferredCurrency} · terms {customer.defaultTermsDays}d
              </div>
            </div>
            <button className="btn btn-secondary" type="button" onClick={() => void removeCustomer(customer.id)} disabled={deleteStatus === "pending"}>
              Delete
            </button>
          </div>
        ))}
        {!isLoading && sortedCustomers.length === 0 ? <div className="text-sm text-slate-400">No customers yet.</div> : null}
      </div>
    </BusinessSection>
  );
}

export default CustomersPage;
