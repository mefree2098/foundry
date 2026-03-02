import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import BusinessSection from "./BusinessSection";
import { fetchBusinessImportJobs, fetchBusinessImportSources, fetchBusinessIntegrations, runBusinessImportJob, saveBusinessImportSource } from "../../lib/api";
import type { BusinessImportSource, BusinessIntegration } from "../../lib/businessSchemas";

const sourceProviderRequirements: Partial<Record<BusinessImportSource["type"], BusinessIntegration["provider"]>> = {
  steam: "steam",
  apple: "apple",
  googleplay: "googleplay",
  distrokid: "distrokid",
  "bank-ofx": "mountain-america-ofx",
};

function ImportsPage() {
  const queryClient = useQueryClient();
  const { data: sources = [], isLoading: loadingSources } = useQuery({ queryKey: ["business", "imports", "sources"], queryFn: fetchBusinessImportSources });
  const { data: jobPage, isLoading: loadingJobs } = useQuery({ queryKey: ["business", "imports", "jobs"], queryFn: () => fetchBusinessImportJobs({ limit: 100 }) });
  const { data: integrations = [], isLoading: loadingIntegrations } = useQuery({ queryKey: ["business", "integrations"], queryFn: fetchBusinessIntegrations });

  const jobs = jobPage?.items || [];

  const [sourceType, setSourceType] = useState<BusinessImportSource["type"]>("manual");
  const [schedule, setSchedule] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [selectedIntegrationId, setSelectedIntegrationId] = useState("");

  const requiredProvider = sourceProviderRequirements[sourceType];
  const eligibleIntegrations = useMemo(
    () =>
      integrations.filter((integration) => {
        if (!requiredProvider) return false;
        return integration.provider === requiredProvider && integration.state === "active";
      }),
    [integrations, requiredProvider],
  );

  const saveSource = useMutation({
    mutationFn: () =>
      saveBusinessImportSource({
        type: sourceType,
        integrationId: requiredProvider ? selectedIntegrationId || undefined : undefined,
        schedule: schedule.trim() || undefined,
        state: "active",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "imports", "sources"] });
      await queryClient.invalidateQueries({ queryKey: ["business", "audit"] });
      setSchedule("");
    },
  });

  const runJob = useMutation({
    mutationFn: () => runBusinessImportJob({ sourceId: selectedSourceId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "imports", "jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["business", "imports", "sources"] });
      await queryClient.invalidateQueries({ queryKey: ["business", "audit"] });
    },
  });

  const requiresIntegration = Boolean(requiredProvider);
  const canAddSource = saveSource.status !== "pending" && (!requiresIntegration || Boolean(selectedIntegrationId));

  return (
    <BusinessSection
      title="Imports"
      summary="Run and monitor Steam, Apple, Google Play, DistroKid, and bank import jobs. Store integration credentials in the Integrations UI, then attach profiles to sources."
    >
      <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-3 md:grid-cols-5">
        <select className="input-field" value={sourceType} onChange={(e) => {
          setSourceType(e.target.value as BusinessImportSource["type"]);
          setSelectedIntegrationId("");
        }}>
          <option value="manual">Manual</option>
          <option value="steam">Steam</option>
          <option value="apple">Apple</option>
          <option value="googleplay">Google Play</option>
          <option value="distrokid">DistroKid</option>
          <option value="bank-csv">Bank CSV</option>
          <option value="bank-ofx">Bank OFX</option>
        </select>

        {requiresIntegration ? (
          <select className="input-field md:col-span-2" value={selectedIntegrationId} onChange={(e) => setSelectedIntegrationId(e.target.value)}>
            <option value="">Select {requiredProvider} integration</option>
            {eligibleIntegrations.map((integration) => (
              <option key={integration.id} value={integration.id}>
                {integration.displayName} ({integration.status})
              </option>
            ))}
          </select>
        ) : (
          <div className="input-field md:col-span-2 flex items-center text-xs text-slate-400">No integration required for this source type.</div>
        )}

        <input className="input-field md:col-span-1" placeholder="Schedule (optional)" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
        <button className="btn btn-primary" type="button" disabled={!canAddSource} onClick={() => void saveSource.mutateAsync()}>
          {saveSource.status === "pending" ? "Saving..." : "Add source"}
        </button>
      </div>

      {requiresIntegration && !loadingIntegrations && eligibleIntegrations.length === 0 ? (
        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          No active <strong>{requiredProvider}</strong> integration is available. Configure one in
          {" "}
          <a href="/admin/business/integrations" className="underline decoration-amber-200/70 underline-offset-2">Integrations</a>
          {" "}
          and run Test connection first.
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Import sources</div>
          {loadingSources ? <div className="mt-2 text-sm text-slate-300">Loading sources...</div> : null}
          <div className="mt-2 space-y-2">
            {sources.map((source) => (
              <label key={source.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200">
                <div>
                  <div className="font-semibold text-slate-100">{source.type}</div>
                  <div className="text-slate-400">
                    {source.id} · {source.state}
                  </div>
                  {source.integrationId ? <div className="text-slate-400">integration {source.integrationId}</div> : null}
                </div>
                <input type="radio" name="selected-source" checked={selectedSourceId === source.id} onChange={() => setSelectedSourceId(source.id)} />
              </label>
            ))}
            {!loadingSources && sources.length === 0 ? <div className="text-sm text-slate-400">No import sources configured.</div> : null}
          </div>
          <button
            className="btn btn-secondary mt-3"
            type="button"
            disabled={runJob.status === "pending" || !selectedSourceId}
            onClick={() => void runJob.mutateAsync()}
          >
            {runJob.status === "pending" ? "Running..." : "Run selected source"}
          </button>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Import jobs</div>
          {loadingJobs ? <div className="mt-2 text-sm text-slate-300">Loading jobs...</div> : null}
          <div className="mt-2 space-y-2">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200">
                <div className="font-semibold text-slate-100">{job.id}</div>
                <div className="text-slate-400">
                  source {job.sourceId} · {job.status} · started {job.startedAt}
                </div>
                <div className="text-slate-400">
                  rows imported {job.stats.rowsImported} / read {job.stats.rowsRead} / skipped {job.stats.rowsSkipped}
                </div>
              </div>
            ))}
            {!loadingJobs && jobs.length === 0 ? <div className="text-sm text-slate-400">No jobs executed yet.</div> : null}
          </div>
        </div>
      </div>
    </BusinessSection>
  );
}

export default ImportsPage;
