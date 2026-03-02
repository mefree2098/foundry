import { useEffect, useState } from "react";
import BusinessSection from "./BusinessSection";
import { useBusinessConfig } from "../../hooks/useBusinessConfig";

function SettingsPage() {
  const { data: config, isLoading, isError, saveConfig, saveConfigStatus } = useBusinessConfig();
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [prefix, setPrefix] = useState("INV-");
  const [padLength, setPadLength] = useState("5");
  const [safeMode, setSafeMode] = useState(true);
  const [simulationDefault, setSimulationDefault] = useState(true);

  useEffect(() => {
    if (!config) return;
    setBaseCurrency(config.baseCurrency || "USD");
    setPrefix(config.invoiceNumbering.prefix || "INV-");
    setPadLength(String(config.invoiceNumbering.padLength || 5));
    setSafeMode(Boolean(config.safeMode));
    setSimulationDefault(Boolean(config.simulationDefault));
  }, [config]);

  const handleSave = async () => {
    await saveConfig({
      baseCurrency: baseCurrency.trim().toUpperCase(),
      invoiceNumbering: {
        prefix: prefix.trim() || "INV-",
        nextSequence: config?.invoiceNumbering?.nextSequence || 1,
        padLength: Number.isFinite(Number(padLength)) ? Math.max(1, Math.trunc(Number(padLength))) : 5,
      },
      safeMode,
      simulationDefault,
    });
  };

  return (
    <BusinessSection
      title="Business Settings"
      summary="Configure base currency, invoice numbering, safe-mode defaults, and system account mappings."
    >
      {isLoading ? <div className="text-sm text-slate-300">Loading config...</div> : null}
      {isError ? <div className="text-sm text-red-300">Failed to load business config.</div> : null}

      <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-3 md:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-xs text-slate-300">Base currency</span>
          <input className="input-field" value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-slate-300">Invoice prefix</span>
          <input className="input-field" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-slate-300">Invoice pad length</span>
          <input className="input-field" value={padLength} onChange={(e) => setPadLength(e.target.value)} />
        </label>
        <div className="grid gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
            <input type="checkbox" checked={safeMode} onChange={(e) => setSafeMode(e.target.checked)} />
            Safe mode
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
            <input type="checkbox" checked={simulationDefault} onChange={(e) => setSimulationDefault(e.target.checked)} />
            Simulation by default
          </label>
        </div>
      </div>

      <button className="btn btn-primary" type="button" onClick={() => void handleSave()} disabled={saveConfigStatus === "pending"}>
        {saveConfigStatus === "pending" ? "Saving..." : "Save settings"}
      </button>

      {config?.chartOfAccounts?.length ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Chart of Accounts</div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {config.chartOfAccounts.map((account) => (
              <div key={account.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200">
                <div className="font-semibold text-slate-100">{account.name}</div>
                <div className="text-slate-400">
                  {account.id} · {account.type}/{account.subtype || "general"}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </BusinessSection>
  );
}

export default SettingsPage;
