import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import BusinessSection from "./BusinessSection";
import { deleteBusinessIntegration, fetchBusinessImportSources, fetchBusinessIntegrations, saveBusinessIntegration, testBusinessIntegration } from "../../lib/api";
import type { BusinessIntegration } from "../../lib/businessSchemas";

type IntegrationOption = {
  value: string;
  label: string;
};

type IntegrationField = {
  key: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  help?: string;
  options?: IntegrationOption[];
};

type IntegrationDocLink = {
  label: string;
  url: string;
};

type IntegrationProviderSpec = {
  label: string;
  summary: string;
  defaultDisplayName: string;
  configFields: IntegrationField[];
  secretFields: IntegrationField[];
  whatYouNeed: string[];
  setupSteps: string[];
  troubleshooting: string[];
  officialLinks: IntegrationDocLink[];
};

const providerSpecs: Record<BusinessIntegration["provider"], IntegrationProviderSpec> = {
  plaid: {
    label: "Plaid Bank Feed",
    summary: "Connect bank transaction feeds through Plaid. Use this for the easiest Mountain America setup path.",
    defaultDisplayName: "Plaid: Mountain America",
    configFields: [
      {
        key: "environment",
        label: "Environment",
        defaultValue: "sandbox",
        options: [
          { value: "sandbox", label: "sandbox" },
          { value: "development", label: "development" },
          { value: "production", label: "production" },
        ],
        help: "Must match the key pair from your Plaid Dashboard.",
      },
      {
        key: "institutionId",
        label: "Institution ID",
        defaultValue: "ins_114754",
        placeholder: "ins_114754",
        help: "Mountain America default is prefilled. Replace only if you use another institution.",
      },
      {
        key: "products",
        label: "Products",
        defaultValue: "transactions",
        placeholder: "transactions",
        help: "Keep this as transactions for bookkeeping imports.",
      },
    ],
    secretFields: [
      {
        key: "clientId",
        label: "Client ID",
        help: "Plaid client_id for the selected environment.",
      },
      {
        key: "secret",
        label: "Secret",
        help: "Plaid secret for the selected environment.",
      },
    ],
    whatYouNeed: [
      "Plaid Dashboard access for your team/app.",
      "The correct key pair (client_id + secret) for sandbox/development/production.",
      "Institution ID (Mountain America is prefilled).",
    ],
    setupSteps: [
      "Open Plaid Dashboard and create/select your app.",
      "Copy client_id and secret for your target environment.",
      "In this UI, choose provider Plaid Bank Feed and confirm environment.",
      "Leave Institution ID as ins_114754 for Mountain America, or replace for another bank.",
      "Save the integration, then click Test connection.",
      "Go to Banking, choose feed type Plaid, and attach this integration profile.",
    ],
    troubleshooting: [
      "If test fails, verify environment matches the keys exactly.",
      "Rotate keys in Plaid Dashboard, then update secrets here if keys were regenerated.",
      "If imports fail later, test the integration again to refresh status and diagnostics.",
    ],
    officialLinks: [
      { label: "Plaid Docs", url: "https://plaid.com/docs/" },
      { label: "Plaid Institutions API", url: "https://plaid.com/docs/api/institutions/#institutionsgetbyid" },
      { label: "Plaid Dashboard", url: "https://dashboard.plaid.com" },
    ],
  },
  "mountain-america-ofx": {
    label: "Mountain America OFX",
    summary: "Direct Connect / OFX profile for Mountain America Federal Credit Union (advanced fallback).",
    defaultDisplayName: "Mountain America CU - Direct",
    configFields: [
      {
        key: "endpoint",
        label: "OFX Endpoint",
        defaultValue: "https://ofx.macu.com",
        placeholder: "https://ofx.macu.com",
        help: "Use your institution-provided OFX endpoint.",
      },
      {
        key: "institutionName",
        label: "Institution Name",
        defaultValue: "Mountain America CU - Direct",
        help: "Recommended name from Mountain America Direct Connect guidance.",
      },
      {
        key: "accountType",
        label: "Account Type",
        defaultValue: "CHECKING",
        options: [
          { value: "CHECKING", label: "CHECKING" },
          { value: "SAVINGS", label: "SAVINGS" },
        ],
      },
    ],
    secretFields: [
      {
        key: "username",
        label: "Username",
        help: "Your OFX/Direct Connect username.",
      },
      {
        key: "password",
        label: "Password",
        help: "Your OFX/Direct Connect password.",
      },
      {
        key: "accountNumber",
        label: "Account Number",
        help: "Bank account number used for Direct Connect.",
      },
    ],
    whatYouNeed: [
      "Mountain America online banking access with Direct Connect enabled.",
      "OFX endpoint and institution name details.",
      "OFX username/password and account number.",
    ],
    setupSteps: [
      "Enable/confirm Direct Connect in Mountain America online banking.",
      "Choose provider Mountain America OFX in this UI.",
      "Keep defaults for endpoint and institution name unless Mountain America gives different values.",
      "Enter OFX username, OFX password, and account number.",
      "Save and run Test connection.",
      "In Banking, choose feed type OFX and attach this integration profile.",
    ],
    troubleshooting: [
      "If test fails, verify Direct Connect is enabled on the account and not only Web Connect.",
      "Confirm account number and OFX credentials match the same account type.",
      "If Mountain America rotates endpoint guidance, update endpoint and test again.",
    ],
    officialLinks: [
      { label: "Mountain America QuickBooks/Quicken Help", url: "https://www.macu.com/help/self-service/quickbooks-and-quicken" },
    ],
  },
  steam: {
    label: "Steamworks Financial API",
    summary: "Steam settlement and sales import profile using Steamworks partner Financial API access.",
    defaultDisplayName: "Steamworks Revenue Import",
    configFields: [
      {
        key: "partnerId",
        label: "Partner ID",
        placeholder: "Numeric Steam partner id",
      },
      {
        key: "apiBase",
        label: "API Base",
        defaultValue: "https://partner.steam-api.com",
        placeholder: "https://partner.steam-api.com",
      },
    ],
    secretFields: [
      {
        key: "financialWebApiKey",
        label: "Financial Web API Key",
        help: "Use the key created for your Financial API Group in Steamworks.",
      },
    ],
    whatYouNeed: [
      "Steamworks partner account admin access.",
      "Financial API Group + Financial Web API key.",
      "Partner ID from Steamworks.",
    ],
    setupSteps: [
      "In Steamworks, create a Financial API Group and generate a Financial Web API key.",
      "Record your Partner ID from Steamworks account settings.",
      "Choose provider Steamworks Financial API in this UI.",
      "Enter Partner ID and Financial Web API key, keep API Base default unless Valve instructs otherwise.",
      "Save and click Test connection.",
      "Create/attach a Steam import source in Imports after status is connected.",
    ],
    troubleshooting: [
      "If test fails, confirm key is specifically a Financial API key (not a general key).",
      "If calls are blocked, check Steamworks key restrictions such as allowed source IPs.",
      "Rotate the API key in Steamworks and update this integration if credentials changed.",
    ],
    officialLinks: [
      { label: "Steamworks Financial API", url: "https://partner.steamgames.com/doc/webapi/IPartnerFinancialsService" },
      { label: "Steamworks Web API Overview", url: "https://partner.steamgames.com/doc/webapi_overview" },
    ],
  },
  apple: {
    label: "App Store Connect",
    summary: "Apple Sales and Finance report integration using App Store Connect API keys.",
    defaultDisplayName: "Apple App Store Reports",
    configFields: [
      {
        key: "issuerId",
        label: "Issuer ID",
        help: "From App Store Connect API key details.",
      },
      {
        key: "keyId",
        label: "Key ID",
        help: "From App Store Connect API key details.",
      },
      {
        key: "vendorNumber",
        label: "Vendor Number",
        help: "From App Store Connect finance/sales reporting account details.",
      },
    ],
    secretFields: [
      {
        key: "privateKeyPem",
        label: "Private Key (PEM)",
        multiline: true,
        placeholder: "-----BEGIN PRIVATE KEY-----",
        help: "Paste the full .p8 key contents including BEGIN/END lines.",
      },
    ],
    whatYouNeed: [
      "App Store Connect access with API key management permissions.",
      "Issuer ID, Key ID, Vendor Number.",
      "Private key (.p8) for the API key.",
    ],
    setupSteps: [
      "In App Store Connect, create an API key for reporting workflows.",
      "Copy Issuer ID and Key ID, and download the private key (.p8).",
      "Get your Vendor Number from the Sales and Finance reporting area.",
      "Choose provider App Store Connect in this UI.",
      "Enter Issuer ID, Key ID, Vendor Number, and paste the full private key PEM.",
      "Save and click Test connection before creating Apple import sources.",
    ],
    troubleshooting: [
      "If test fails, confirm the private key still matches the selected Key ID.",
      "Make sure the vendor number is for the correct legal entity/account.",
      "If a key is revoked in App Store Connect, generate a new key and update this profile.",
    ],
    officialLinks: [
      { label: "App Store Connect API Overview", url: "https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api" },
      { label: "Sales and Trends Availability", url: "https://developer.apple.com/help/app-store-connect/reference/sales-and-trends-reports-availability" },
    ],
  },
  googleplay: {
    label: "Google Play Reporting",
    summary: "Google Play financial reporting profile using Cloud Storage export and service account access.",
    defaultDisplayName: "Google Play Revenue Import",
    configFields: [
      {
        key: "bucketUri",
        label: "Bucket URI",
        placeholder: "gs://pubsite_prod_rev_xxx",
        help: "Use the Cloud Storage URI from Play Console financial reports.",
      },
      {
        key: "packageName",
        label: "Package Name",
        placeholder: "com.example.app",
        help: "Optional filter if you only import one app package.",
      },
    ],
    secretFields: [
      {
        key: "serviceAccountJson",
        label: "Service Account JSON",
        multiline: true,
        placeholder: "{\"client_email\": \"...\", \"private_key\": \"...\"}",
        help: "Paste the entire JSON key for a service account with read access to the reporting bucket.",
      },
    ],
    whatYouNeed: [
      "Google Play Console owner/admin access.",
      "Play financial Cloud Storage URI.",
      "Google Cloud service account JSON with bucket read permissions.",
    ],
    setupSteps: [
      "In Play Console, open Financial reports and copy the Cloud Storage URI.",
      "In Google Cloud, create/select a service account and grant bucket read permissions.",
      "Download the service account JSON key.",
      "Choose provider Google Play Reporting in this UI.",
      "Enter Bucket URI, optional Package Name, and paste service account JSON.",
      "Save and run Test connection before creating Google Play import sources.",
    ],
    troubleshooting: [
      "If test fails, verify the JSON key is complete and valid.",
      "Confirm service account has Storage Object Viewer (or equivalent) on the target bucket.",
      "Double-check bucket URI prefix starts with gs:// and matches the Play Console value.",
    ],
    officialLinks: [
      { label: "Google Play Reporting: Play Console Data", url: "https://developers.google.com/play/developer/reporting/play-console" },
      { label: "Google Play Reporting Transfer Guide", url: "https://developers.google.com/play/developer/reporting/gs-to-bq" },
      { label: "Android Publisher API Getting Started", url: "https://developers.google.com/android-publisher/getting_started" },
    ],
  },
  distrokid: {
    label: "DistroKid",
    summary: "DistroKid earnings import profile. Easiest path is manual CSV export mode.",
    defaultDisplayName: "DistroKid Earnings Import",
    configFields: [
      {
        key: "accountEmail",
        label: "Account Email",
        help: "Email for the DistroKid account used to export earnings reports.",
      },
      {
        key: "mode",
        label: "Mode",
        defaultValue: "manual_csv",
        options: [
          { value: "manual_csv", label: "manual_csv (recommended)" },
          { value: "automated", label: "automated" },
        ],
        help: "manual_csv avoids fragile session automation and is the recommended starting mode.",
      },
    ],
    secretFields: [
      {
        key: "sessionCookie",
        label: "Session Cookie",
        help: "Only for automated mode.",
      },
      {
        key: "csvExportToken",
        label: "CSV Export Token",
        help: "Only for automated mode.",
      },
      {
        key: "apiToken",
        label: "API Token (alternate)",
        help: "Only for automated mode if your workflow uses API token auth.",
      },
    ],
    whatYouNeed: [
      "DistroKid account access.",
      "Account email.",
      "For manual mode: ability to download CSV from Bank -> SEE EXCRUCIATING DETAIL.",
    ],
    setupSteps: [
      "Choose provider DistroKid in this UI.",
      "Enter Account Email and keep Mode as manual_csv for easiest setup.",
      "Save and click Test connection (manual mode does not require secrets).",
      "In DistroKid, export CSV from Bank -> SEE EXCRUCIATING DETAIL.",
      "Upload CSV via the Imports flow and run the DistroKid source job.",
      "Use automated mode only if you have stable credential automation in your org.",
    ],
    troubleshooting: [
      "If automated mode test fails, switch back to manual_csv and use CSV uploads.",
      "Large DistroKid exports may need filtered date ranges to keep files manageable.",
      "Re-test after changing mode or any secret values.",
    ],
    officialLinks: [
      { label: "DistroKid Excruciating Detail Help", url: "https://support.distrokid.com/hc/en-us/articles/360013648113" },
    ],
  },
};

function buildDefaultConfig(provider: BusinessIntegration["provider"]) {
  const config: Record<string, string> = {};
  for (const field of providerSpecs[provider].configFields) {
    if (field.defaultValue) config[field.key] = field.defaultValue;
  }
  return config;
}

function toConfigRecord(values: Record<string, string>) {
  const entries = Object.entries(values)
    .map(([key, value]) => [key, value.trim()] as const)
    .filter(([, value]) => value.length > 0);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function toSecretsRecord(values: Record<string, string>) {
  const entries = Object.entries(values)
    .map(([key, value]) => [key, value] as const)
    .filter(([, value]) => value.length > 0);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function stringifyConfigValue(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function IntegrationsPage() {
  const queryClient = useQueryClient();
  const { data: integrations = [], isLoading } = useQuery({ queryKey: ["business", "integrations"], queryFn: fetchBusinessIntegrations });
  const { data: sources = [] } = useQuery({ queryKey: ["business", "imports", "sources"], queryFn: fetchBusinessImportSources });

  const [editingId, setEditingId] = useState<string | undefined>();
  const [provider, setProvider] = useState<BusinessIntegration["provider"]>("mountain-america-ofx");
  const [displayName, setDisplayName] = useState(providerSpecs["mountain-america-ofx"].defaultDisplayName);
  const [state, setState] = useState<BusinessIntegration["state"]>("active");
  const [configValues, setConfigValues] = useState<Record<string, string>>(buildDefaultConfig("mountain-america-ofx"));
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});

  const activeSourcesByIntegration = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const source of sources) {
      if (!source.integrationId || source.state !== "active") continue;
      const existing = map.get(source.integrationId) || [];
      existing.push(source.id);
      map.set(source.integrationId, existing);
    }
    return map;
  }, [sources]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveBusinessIntegration({
        id: editingId,
        provider,
        displayName: displayName.trim(),
        state,
        config: toConfigRecord(configValues),
        secrets: toSecretsRecord(secretValues),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "integrations"] });
      await queryClient.invalidateQueries({ queryKey: ["business", "audit"] });
      setEditingId(undefined);
      setDisplayName(providerSpecs[provider].defaultDisplayName);
      setConfigValues(buildDefaultConfig(provider));
      setSecretValues({});
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => testBusinessIntegration(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "integrations"] });
      await queryClient.invalidateQueries({ queryKey: ["business", "audit"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBusinessIntegration(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "integrations"] });
      await queryClient.invalidateQueries({ queryKey: ["business", "imports", "sources"] });
      await queryClient.invalidateQueries({ queryKey: ["business", "audit"] });
    },
  });

  useEffect(() => {
    setConfigValues(buildDefaultConfig(provider));
    setDisplayName(providerSpecs[provider].defaultDisplayName);
    setSecretValues({});
  }, [provider]);

  const currentSpec = providerSpecs[provider];
  const saveError = saveMutation.error instanceof Error ? saveMutation.error.message : null;
  const testError = testMutation.error instanceof Error ? testMutation.error.message : null;
  const deleteError = deleteMutation.error instanceof Error ? deleteMutation.error.message : null;

  return (
    <BusinessSection
      title="Integrations"
      summary="Configure and validate all external credentials in the UI. No integration credentials are read from `.env` at runtime for business imports."
    >
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
        <div className="text-xs uppercase tracking-wide text-emerald-200">Simple Setup Flow</div>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs md:text-sm">
          <li>Select an integration provider.</li>
          <li>Follow the setup guide and links below to collect required values.</li>
          <li>Paste config and secret values into this form.</li>
          <li>Click Save, then Test connection until status is connected.</li>
          <li>Attach the integration to Banking or Imports sources.</li>
        </ol>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">Connection profile</div>
        <p className="mt-2 text-sm text-slate-300">{currentSpec.summary}</p>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="grid gap-1">
            <span className="text-xs text-slate-300">Provider</span>
            <select
              className="input-field"
              value={provider}
              onChange={(e) => {
                setEditingId(undefined);
                setProvider(e.target.value as BusinessIntegration["provider"]);
                setState("active");
              }}
            >
              {Object.entries(providerSpecs).map(([value, spec]) => (
                <option key={value} value={value}>
                  {spec.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 md:col-span-2">
            <span className="text-xs text-slate-300">Display name</span>
            <input className="input-field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Friendly name" />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-slate-300">State</span>
            <select className="input-field" value={state} onChange={(e) => setState(e.target.value as BusinessIntegration["state"])}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Setup Guide: {currentSpec.label}</div>

          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">What You Need</div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-200">
                {currentSpec.whatYouNeed.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Official Docs</div>
              <div className="mt-2 space-y-1 text-xs">
                {currentSpec.officialLinks.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-emerald-200 underline decoration-emerald-200/60 underline-offset-2 hover:text-emerald-100"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Step-by-Step</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-200">
              {currentSpec.setupSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="mt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Troubleshooting</div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-200">
              {currentSpec.troubleshooting.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {currentSpec.configFields.map((field) => (
            <label key={field.key} className="grid gap-1">
              <span className="text-xs text-slate-300">{field.label}</span>
              {field.options ? (
                <select
                  className="input-field"
                  value={configValues[field.key] || field.defaultValue || ""}
                  onChange={(e) => setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                >
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.multiline ? (
                <textarea
                  className="input-field min-h-[96px]"
                  value={configValues[field.key] || ""}
                  onChange={(e) => setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                />
              ) : (
                <input
                  className="input-field"
                  value={configValues[field.key] || ""}
                  onChange={(e) => setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                />
              )}
              {field.help ? <span className="text-xs text-slate-400">{field.help}</span> : null}
            </label>
          ))}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {currentSpec.secretFields.map((field) => (
            <label key={field.key} className="grid gap-1">
              <span className="text-xs text-slate-300">{field.label}</span>
              {field.multiline ? (
                <textarea
                  className="input-field min-h-[120px]"
                  value={secretValues[field.key] || ""}
                  onChange={(e) => setSecretValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder || "Enter secret"}
                />
              ) : (
                <input
                  className="input-field"
                  type="password"
                  value={secretValues[field.key] || ""}
                  onChange={(e) => setSecretValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder || "Enter secret"}
                />
              )}
              {field.help ? <span className="text-xs text-slate-400">{field.help}</span> : null}
            </label>
          ))}
        </div>

        <div className="mt-2 text-xs text-slate-400">Secret values are stored server-side in encrypted form and are never returned to the browser after save.</div>

        {saveError ? <div className="mt-2 text-xs text-red-300">{saveError}</div> : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            type="button"
            disabled={saveMutation.status === "pending" || !displayName.trim()}
            onClick={() => void saveMutation.mutateAsync()}
          >
            {saveMutation.status === "pending" ? "Saving..." : editingId ? "Save changes" : "Create integration"}
          </button>
          {editingId ? (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                setEditingId(undefined);
                setProvider("mountain-america-ofx");
                setDisplayName(providerSpecs["mountain-america-ofx"].defaultDisplayName);
                setConfigValues(buildDefaultConfig("mountain-america-ofx"));
                setSecretValues({});
                setState("active");
              }}
            >
              Cancel edit
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">Configured integrations</div>
        {isLoading ? <div className="mt-2 text-sm text-slate-300">Loading integrations...</div> : null}
        {testError ? <div className="mt-2 text-xs text-red-300">{testError}</div> : null}
        {deleteError ? <div className="mt-2 text-xs text-red-300">{deleteError}</div> : null}

        <div className="mt-2 space-y-2">
          {integrations.map((integration) => {
            const linkedSources = activeSourcesByIntegration.get(integration.id) || [];

            return (
              <div key={integration.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-100">{integration.displayName}</div>
                    <div className="text-slate-400">
                      {integration.provider} · state {integration.state} · status {integration.status}
                    </div>
                    <div className="text-slate-400">
                      secrets {integration.secretMeta.keyCount} · last tested {integration.lastTestedAt || "never"}
                    </div>
                    {integration.statusMessage ? <div className="text-slate-400">{integration.statusMessage}</div> : null}
                    {linkedSources.length ? <div className="text-slate-400">active sources: {linkedSources.join(", ")}</div> : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => {
                        setEditingId(integration.id);
                        setProvider(integration.provider);
                        setDisplayName(integration.displayName);
                        setState(integration.state);

                        const config: Record<string, string> = {};
                        for (const field of providerSpecs[integration.provider].configFields) {
                          const value = integration.config[field.key];
                          if (value !== undefined) config[field.key] = stringifyConfigValue(value);
                          else if (field.defaultValue) config[field.key] = field.defaultValue;
                        }
                        setConfigValues(config);
                        setSecretValues({});
                      }}
                    >
                      Edit
                    </button>
                    <button className="btn btn-secondary" type="button" disabled={testMutation.status === "pending"} onClick={() => void testMutation.mutateAsync(integration.id)}>
                      {testMutation.status === "pending" ? "Testing..." : "Test connection"}
                    </button>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={deleteMutation.status === "pending" || linkedSources.length > 0}
                      onClick={() => void deleteMutation.mutateAsync(integration.id)}
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {!isLoading && integrations.length === 0 ? <div className="text-sm text-slate-400">No integrations configured yet.</div> : null}
        </div>
      </div>
    </BusinessSection>
  );
}

export default IntegrationsPage;
