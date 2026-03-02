import { QueryClient } from "@tanstack/react-query";
import type { NewsPost, Platform, SiteConfig, Subscriber, Topic } from "./types";
import type {
  BusinessAiAction,
  BusinessAuditEvent,
  BusinessBankAccount,
  BusinessBankTransaction,
  BusinessConfig,
  BusinessCustomer,
  BusinessCustomerInput,
  BusinessImportJob,
  BusinessIntegration,
  BusinessIntegrationInput,
  BusinessImportSource,
  BusinessInvoice,
  BusinessInvoiceInput,
  BusinessJournalEntry,
  BusinessPayment,
  BusinessPaymentInput,
  BusinessReconcileRun,
  BusinessVendor,
  BusinessVendorInput,
} from "./businessSchemas";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // always refetch on mount to show latest data
      gcTime: 30 * 60 * 1000, // 30 minutes
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
    },
  },
});

const base = import.meta.env.VITE_API_BASE || "/api";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const fetchPlatforms = () => getJson<Platform[]>("/platforms");
export const fetchNews = (params?: { platformId?: string; topic?: string }) => {
  const search = new URLSearchParams();
  if (params?.platformId) search.set("platformId", params.platformId);
  if (params?.topic) search.set("topic", params.topic);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return getJson<NewsPost[]>(`/news${suffix}`);
};
export const fetchTopics = () => getJson<Topic[]>("/topics");
export const fetchConfig = () => getJson<SiteConfig>("/config");
export const fetchBusinessConfig = () => getJson<BusinessConfig>("/business/config");

async function sendJson<T>(path: string, method: "POST" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.status === 204 ? (undefined as unknown as T) : ((await res.json()) as T);
}

export const savePlatform = (payload: Platform) => sendJson<Platform>("/platforms", "POST", payload);
export const deletePlatform = (id: string) => sendJson<void>(`/platforms/${id}`, "DELETE");

export const saveTopic = (payload: Topic) => sendJson<Topic>("/topics", "POST", payload);
export const deleteTopic = (id: string) => sendJson<void>(`/topics/${id}`, "DELETE");

export const saveNews = (payload: NewsPost) => sendJson<NewsPost>("/news", "POST", payload);
export const deleteNews = (id: string) => sendJson<void>(`/news/${id}`, "DELETE");

export const saveConfig = (payload: SiteConfig) => sendJson<SiteConfig>("/config", "POST", payload);
export const saveBusinessConfig = (payload: Partial<BusinessConfig>) => sendJson<BusinessConfig>("/business/config", "POST", payload);

export const fetchBusinessCustomers = () => getJson<BusinessCustomer[]>("/business/customers");
export const fetchBusinessCustomer = (id: string) => getJson<BusinessCustomer>(`/business/customers/${encodeURIComponent(id)}`);
export const saveBusinessCustomer = (payload: BusinessCustomerInput) => sendJson<BusinessCustomer>("/business/customers", "POST", payload);
export const deleteBusinessCustomer = (id: string) => sendJson<void>(`/business/customers/${encodeURIComponent(id)}`, "DELETE");

export const fetchBusinessAudit = (params?: { limit?: number; cursor?: string }) => {
  const search = new URLSearchParams();
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return getJson<{ items: BusinessAuditEvent[]; cursor?: string }>(`/business/audit${suffix}`);
};

export const fetchBusinessVendors = () => getJson<BusinessVendor[]>("/business/vendors");
export const fetchBusinessVendor = (id: string) => getJson<BusinessVendor>(`/business/vendors/${encodeURIComponent(id)}`);
export const saveBusinessVendor = (payload: BusinessVendorInput) => sendJson<BusinessVendor>("/business/vendors", "POST", payload);
export const deleteBusinessVendor = (id: string) => sendJson<void>(`/business/vendors/${encodeURIComponent(id)}`, "DELETE");

export const fetchBusinessInvoices = (params?: {
  status?: BusinessInvoice["status"];
  customerId?: string;
  limit?: number;
  cursor?: string;
}) => {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.customerId) search.set("customerId", params.customerId);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return getJson<{ items: BusinessInvoice[]; cursor?: string }>(`/business/invoices${suffix}`);
};
export const fetchBusinessInvoice = (id: string) => getJson<BusinessInvoice>(`/business/invoices/${encodeURIComponent(id)}`);
export const saveBusinessInvoice = (payload: BusinessInvoiceInput) => sendJson<BusinessInvoice>("/business/invoices", "POST", payload);
export const issueBusinessInvoice = (id: string) => sendJson<BusinessInvoice>(`/business/invoices/${encodeURIComponent(id)}/issue`, "POST");
export const voidBusinessInvoice = (id: string) => sendJson<BusinessInvoice>(`/business/invoices/${encodeURIComponent(id)}`, "DELETE");
export const generateBusinessInvoicePdf = (id: string) =>
  sendJson<{ invoiceId: string; pdf: NonNullable<BusinessInvoice["pdf"]> }>(`/business/invoices/${encodeURIComponent(id)}/pdf`, "POST");
export const fetchBusinessInvoicePdf = (id: string) =>
  getJson<{ invoiceId: string; pdf: NonNullable<BusinessInvoice["pdf"]> }>(`/business/invoices/${encodeURIComponent(id)}/pdf`);
export const sendBusinessInvoice = (id: string, payload?: { recipients?: string[]; idempotencyKey?: string }) =>
  sendJson<BusinessInvoice>(`/business/invoices/${encodeURIComponent(id)}/send`, "POST", payload || {});

export const fetchBusinessPayments = (params?: { invoiceId?: string; limit?: number; cursor?: string }) => {
  const search = new URLSearchParams();
  if (params?.invoiceId) search.set("invoiceId", params.invoiceId);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return getJson<{ items: BusinessPayment[]; cursor?: string }>(`/business/payments${suffix}`);
};
export const postBusinessPayment = (payload: BusinessPaymentInput) =>
  sendJson<{ payment: BusinessPayment; invoice?: BusinessInvoice }>("/business/payments", "POST", payload);
export const reverseBusinessPayment = (id: string) =>
  sendJson<{ payment: BusinessPayment; invoice?: BusinessInvoice }>(`/business/payments/${encodeURIComponent(id)}`, "DELETE");

export const fetchBusinessLedger = (params?: { limit?: number; cursor?: string; trialBalance?: boolean }) => {
  const search = new URLSearchParams();
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.trialBalance) search.set("trialBalance", "1");
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return getJson<{ entries: BusinessJournalEntry[]; cursor?: string; chartOfAccounts: BusinessConfig["chartOfAccounts"]; trialBalance?: { byAccount: Record<string, number>; total: number; balanced: boolean } }>(
    `/business/ledger${suffix}`,
  );
};

export const fetchBusinessBankAccounts = () => getJson<BusinessBankAccount[]>("/business/bank/accounts");
export const saveBusinessBankAccount = (payload: {
  id?: string;
  displayName: string;
  institution?: string;
  mask?: string;
  currency?: string;
  feedType?: "plaid" | "ofx" | "manual";
  integrationId?: string;
  connectionState?: "connected" | "needs_reauth" | "disabled";
  ledgerCashAccountId?: string;
}) => sendJson<BusinessBankAccount>("/business/bank/accounts", "POST", payload);

export const fetchBusinessBankTransactions = (params?: {
  bankAccountId?: string;
  status?: BusinessBankTransaction["status"];
  limit?: number;
  cursor?: string;
}) => {
  const search = new URLSearchParams();
  if (params?.bankAccountId) search.set("bankAccountId", params.bankAccountId);
  if (params?.status) search.set("status", params.status);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return getJson<{ items: BusinessBankTransaction[]; cursor?: string }>(`/business/bank/transactions${suffix}`);
};
export const importBusinessBankTransactions = (payload: {
  bankAccountId: string;
  source?: "csv" | "ofx" | "qfx" | "manual";
  transactions: Array<{
    postedDate: string;
    description: string;
    amountMinor: number;
    currency?: string;
    authorizedDate?: string;
    merchant?: string;
    categoryHint?: string;
    sourceRef?: string;
    raw?: Record<string, unknown>;
  }>;
}) => sendJson<{ imported: number; skipped: number; items: BusinessBankTransaction[] }>("/business/bank/import", "POST", payload);

export const runBusinessReconcile = (payload: { bankAccountId: string; throughDate?: string; apply?: boolean }) =>
  sendJson<BusinessReconcileRun>("/business/reconcile/run", "POST", payload);
export const fetchBusinessReconcileStatus = (params?: { bankAccountId?: string; runId?: string }) => {
  const search = new URLSearchParams();
  if (params?.bankAccountId) search.set("bankAccountId", params.bankAccountId);
  if (params?.runId) search.set("runId", params.runId);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return getJson<BusinessReconcileRun>(`/business/reconcile/status${suffix}`);
};

export const fetchBusinessReport = (reportType: string, params?: { fromDate?: string; toDate?: string; asOfDate?: string }) => {
  const search = new URLSearchParams();
  if (params?.fromDate) search.set("fromDate", params.fromDate);
  if (params?.toDate) search.set("toDate", params.toDate);
  if (params?.asOfDate) search.set("asOfDate", params.asOfDate);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return getJson<Record<string, unknown>>(`/business/reports/${encodeURIComponent(reportType)}${suffix}`);
};

export const fetchBusinessImportSources = () => getJson<BusinessImportSource[]>("/business/imports/sources");
export const saveBusinessImportSource = (payload: {
  id?: string;
  type: BusinessImportSource["type"];
  integrationId?: string;
  config?: Record<string, unknown>;
  schedule?: string;
  state?: "active" | "disabled";
}) => sendJson<BusinessImportSource>("/business/imports/sources", "POST", payload);

export const fetchBusinessImportJobs = (params?: { sourceId?: string; limit?: number; cursor?: string }) => {
  const search = new URLSearchParams();
  if (params?.sourceId) search.set("sourceId", params.sourceId);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return getJson<{ items: BusinessImportJob[]; cursor?: string }>(`/business/imports/jobs${suffix}`);
};
export const runBusinessImportJob = (payload: { sourceId: string; idempotencyKey?: string; options?: Record<string, unknown> }) =>
  sendJson<BusinessImportJob>("/business/imports/jobs", "POST", payload);
export const fetchBusinessImportJob = (id: string) => getJson<BusinessImportJob>(`/business/imports/jobs/${encodeURIComponent(id)}`);

export const fetchBusinessIntegrations = () => getJson<BusinessIntegration[]>("/business/integrations");
export const saveBusinessIntegration = (payload: BusinessIntegrationInput) => sendJson<BusinessIntegration>("/business/integrations", "POST", payload);
export const testBusinessIntegration = (id: string) => sendJson<BusinessIntegration>(`/business/integrations/${encodeURIComponent(id)}/test`, "POST");
export const deleteBusinessIntegration = (id: string) => sendJson<void>(`/business/integrations/${encodeURIComponent(id)}`, "DELETE");

export const fetchBusinessInvariants = () =>
  getJson<{
    ok: boolean;
    checkedAt: string;
    trialBalance: { byAccount: Record<string, number>; total: number; balanced: boolean };
    counts: { journalEntries: number; invoices: number; bankTransactions: number };
    issues: string[];
  }>("/business/invariants/check");

export const businessAiChat = (payload: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  mode?: "safe" | "simulation" | "live";
  context?: Record<string, unknown>;
}) =>
  sendJson<{
    assistantMessage: string;
    mode: "safe" | "simulation" | "live";
    proposedActions: BusinessAiAction[];
    confirmToken: string;
    payloadHash: string;
  }>("/business/ai/chat", "POST", payload);

export const businessAiApply = (payload: {
  mode?: "simulation" | "live";
  actions: BusinessAiAction[];
  confirmToken?: string;
}) =>
  sendJson<{
    mode: "simulation" | "live";
    appliedCount: number;
    results: Array<{ actionId: string; type: string; ok: boolean; result?: unknown; error?: string }>;
  }>("/business/ai/apply", "POST", payload);

export const requestUploadSas = (filename: string, contentType: string) =>
  sendJson<{ uploadUrl: string; blobUrl: string; expiresOn: string }>("/media/sas", "POST", { filename, contentType });

export const fetchMediaList = (params?: { prefix?: string; limit?: number; continuationToken?: string }) => {
  const search = new URLSearchParams();
  if (params?.prefix) search.set("prefix", params.prefix);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.continuationToken) search.set("continuationToken", params.continuationToken);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return getJson<{ items: { name: string; url: string; contentType?: string; size?: number; lastModified?: string }[]; continuationToken?: string }>(
    `/media/list${suffix}`,
  );
};

export const generateImage = (payload: {
  prompt: string;
  model?: string;
  size?: string;
  quality?: "low" | "medium" | "high" | "auto";
  background?: "transparent" | "opaque" | "auto";
  outputFormat?: "png" | "jpeg" | "webp";
  filenameHint?: string;
}) =>
  sendJson<{ blobUrl: string; name: string; model: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }>(
    "/ai/image-generate",
    "POST",
    payload,
  );

export const subscribe = (payload: { email: string; subscribeAll?: boolean; platformIds?: string[] }) =>
  sendJson<{ ok: boolean }>("/subscriptions", "POST", payload);

export const fetchSubscribers = () => getJson<Subscriber[]>("/subscriptions");

export const sendEmailCampaign = (payload: {
  newsId?: string;
  platformIds?: string[];
  sendToAll?: boolean;
  subject?: string;
  html?: string;
}) => sendJson<{ ok: boolean }>("/email/send", "POST", payload);

export const unsubscribe = (email: string) => sendJson<{ ok?: boolean }>("/subscriptions/unsubscribe", "POST", { email });

export const fetchEmailStats = () =>
  getJson<{
    active: number;
    unsubscribed: number;
    total: number;
    totalSent: number;
    totalFailed: number;
    totalCampaigns: number;
    lastSentAt?: string;
    lastError?: string;
  }>("/email/stats");

export const submitContact = (payload: {
  name: string;
  email: string;
  subject?: string;
  message: string;
  company?: string;
  phone?: string;
  pageUrl?: string;
}) => sendJson<{ ok: boolean; id?: string }>("/contact", "POST", payload);

export const fetchContactSubmissions = (limit?: number) => {
  const search = new URLSearchParams();
  if (limit) search.set("limit", String(limit));
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return getJson<
    {
      id: string;
      name: string;
      email: string;
      subject?: string;
      message: string;
      company?: string;
      phone?: string;
      pageUrl?: string;
      createdAt: string;
      status: string;
    }[]
  >(`/contact/submissions${suffix}`);
};

export const fetchAiUsage = () =>
  getJson<{
    updatedAt?: string;
    pricing: { source: string; updatedAt?: string; models: Record<string, { inputUsdPerMillion: number; outputUsdPerMillion: number }> };
    allTime: {
      models: { models: Record<string, any>; totals: any };
      images: { models: Record<string, any>; totals: any };
    };
    last30Days: {
      models: { models: Record<string, any>; totals: any };
      images: { models: Record<string, any>; totals: any };
    };
  }>("/ai/usage");

export const refreshAiPricing = (payload?: { pricingText?: string; models?: Record<string, { inputUsdPerMillion: number; outputUsdPerMillion: number }> }) =>
  sendJson<{ source?: string; updatedAt?: string; models?: Record<string, { inputUsdPerMillion: number; outputUsdPerMillion: number }> }>(
    "/ai/pricing/refresh",
    "POST",
    payload,
  );

export const fetchAiPricing = () =>
  getJson<{ source?: string; updatedAt?: string; models?: Record<string, { inputUsdPerMillion: number; outputUsdPerMillion: number }> }>(
    "/ai/pricing",
  );

export type AiChatMessage = { role: "user" | "assistant"; content: string };
export type AiChatAction =
  | { type: "config.merge"; value: unknown }
  | { type: "platform.upsert"; value: unknown }
  | { type: "topic.upsert"; value: unknown }
  | { type: "news.upsert"; value: unknown }
  | { type: "platform.delete"; id: string }
  | { type: "topic.delete"; id: string }
  | { type: "news.delete"; id: string }
  | {
      type: "media.generate";
      value: {
        prompt: string;
        targetType: "platform" | "news" | "config";
        targetId?: string;
        field: string;
        size?: string;
        quality?: "low" | "medium" | "high" | "auto";
        background?: "transparent" | "opaque" | "auto";
      };
    };

export type AiChatResponse = { assistantMessage: string; actions?: AiChatAction[] };

export type CodexModelPickerItem = {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  isDefault: boolean;
  supportsPersonality: boolean;
  defaultReasoningEffort?: string;
  inputModalities: string[];
  supportedReasoningEfforts: string[];
  upgrade?: string;
};

export type CodexModelsResponse = {
  source: "codex";
  includeHidden: boolean;
  loginRequired: boolean;
  authUrl?: string;
  pendingLoginId?: string;
  callbackHint?: string;
  models: CodexModelPickerItem[];
};

export const fetchCodexModels = (params?: { codexPath?: string; codexHome?: string; includeHidden?: boolean; startLogin?: boolean }) => {
  const search = new URLSearchParams();
  if (params?.codexPath) search.set("codexPath", params.codexPath);
  if (params?.codexHome) search.set("codexHome", params.codexHome);
  if (params?.includeHidden) search.set("includeHidden", "1");
  if (params?.startLogin) search.set("startLogin", "1");
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return getJson<CodexModelsResponse>(`/ai/codex-models${suffix}`);
};

export const completeCodexLogin = (payload: { loginId: string; callbackUrl: string }) =>
  sendJson<{ success: boolean }>("/ai/codex-login/complete", "POST", payload);

export const aiChat = (payload: {
  authMode?: "apiKey" | "codexPath";
  apiKey?: string;
  codexPath?: string;
  codexHome?: string;
  model?: string;
  messages: AiChatMessage[];
  context?: unknown;
}) => sendJson<AiChatResponse>("/ai/chat", "POST", payload);

export const aiChatStream = (payload: {
  authMode?: "apiKey" | "codexPath";
  apiKey?: string;
  codexPath?: string;
  codexHome?: string;
  model?: string;
  messages: AiChatMessage[];
  context?: unknown;
}) =>
  fetch(`${base}/ai/chat?stream=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
