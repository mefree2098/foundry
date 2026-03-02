import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import BusinessSection from "./BusinessSection";
import { deleteBusinessVendor, fetchBusinessVendors, saveBusinessVendor } from "../../lib/api";

function VendorsPage() {
  const queryClient = useQueryClient();
  const { data: vendors = [], isLoading, isError } = useQuery({ queryKey: ["business", "vendors"], queryFn: fetchBusinessVendors });

  const [id, setId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");

  const saveMutation = useMutation({
    mutationFn: () =>
      saveBusinessVendor({
        id: id.trim().toLowerCase(),
        displayName: displayName.trim(),
        emails: email.trim() ? [email.trim()] : [],
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "vendors"] });
      await queryClient.invalidateQueries({ queryKey: ["business", "audit"] });
      setId("");
      setDisplayName("");
      setEmail("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (vendorId: string) => deleteBusinessVendor(vendorId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "vendors"] });
      await queryClient.invalidateQueries({ queryKey: ["business", "audit"] });
    },
  });

  const sortedVendors = useMemo(() => [...vendors].sort((a, b) => a.displayName.localeCompare(b.displayName)), [vendors]);

  return (
    <BusinessSection title="Vendors" summary="Manage vendor profiles for expenses, payouts, and contractor records.">
      <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-3 md:grid-cols-4">
        <input className="input-field" placeholder="id" value={id} onChange={(e) => setId(e.target.value)} />
        <input className="input-field" placeholder="display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <input className="input-field" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button
          className="btn btn-primary"
          type="button"
          disabled={saveMutation.status === "pending" || !id.trim() || !displayName.trim()}
          onClick={() => void saveMutation.mutateAsync()}
        >
          {saveMutation.status === "pending" ? "Saving..." : "Save vendor"}
        </button>
      </div>

      {isLoading ? <div className="text-sm text-slate-300">Loading vendors...</div> : null}
      {isError ? <div className="text-sm text-red-300">Failed to load vendors.</div> : null}

      <div className="space-y-2">
        {sortedVendors.map((vendor) => (
          <div key={vendor.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div>
              <div className="font-semibold text-slate-100">{vendor.displayName}</div>
              <div className="text-xs text-slate-400">
                {vendor.id} · {vendor.status} · {vendor.w9Status}
              </div>
            </div>
            <button className="btn btn-secondary" type="button" onClick={() => void deleteMutation.mutateAsync(vendor.id)} disabled={deleteMutation.status === "pending"}>
              Delete
            </button>
          </div>
        ))}
        {!isLoading && sortedVendors.length === 0 ? <div className="text-sm text-slate-400">No vendors yet.</div> : null}
      </div>
    </BusinessSection>
  );
}

export default VendorsPage;
