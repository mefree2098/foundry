import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  fetchConfig,
  fetchEmailStats,
  fetchNews,
  fetchPlatforms,
  fetchSubscribers,
  saveConfig,
  sendEmailCampaign,
} from "../lib/api";
import type { EmailSettings, SiteConfig } from "../lib/types";
import SectionCard from "./SectionCard";

const DEFAULT_TEMPLATE = `<h2 style="margin:0 0 10px;">New update: {{newsTitle}}</h2>
{{newsSection}}
<p style="margin:18px 0 0;">
  <a href="{{newsUrl}}">Read the full update</a>
</p>
<p style="font-size:12px;margin-top:22px;">
  <a href="{{manageUrl}}">Manage preferences</a>&nbsp;&middot;&nbsp;<a href="{{unsubscribeUrl}}">Unsubscribe</a>
</p>`;

const baseSettings: EmailSettings = {
  fromName: "Foundry",
  templateSubject: "Foundry update",
  templateHtml: DEFAULT_TEMPLATE,
  batchSize: 490,
  autoNotifyOnNews: false,
};

function AdminEmailSection() {
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: fetchConfig });
  const { data: subscribers = [] } = useQuery({ queryKey: ["subscribers"], queryFn: fetchSubscribers });
  const { data: platforms = [] } = useQuery({ queryKey: ["platforms"], queryFn: fetchPlatforms });
  const { data: news = [] } = useQuery({ queryKey: ["news", { all: true }], queryFn: () => fetchNews() });
  const { data: emailStats } = useQuery({ queryKey: ["email-stats"], queryFn: fetchEmailStats });

  const [settings, setSettings] = useState<EmailSettings>(baseSettings);
  const [newsId, setNewsId] = useState("");
  const [sendToAll, setSendToAll] = useState(true);
  const [platformIds, setPlatformIds] = useState<string[]>([]);
  const [customSubject, setCustomSubject] = useState("");
  const [customHtml, setCustomHtml] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);

  const activeCount = useMemo(() => subscribers.filter((s) => s.status !== "unsubscribed").length, [subscribers]);
  const unsubCount = subscribers.length - activeCount;

  useEffect(() => {
    if (config?.emailSettings) {
      setSettings({ ...baseSettings, ...config.emailSettings });
      setCustomSubject(config.emailSettings.templateSubject || "");
      setCustomHtml(config.emailSettings.templateHtml || DEFAULT_TEMPLATE);
      setHasApiKey(Boolean(config.emailSettings.hasMailerLiteApiKey));
      setApiKeyInput("");
    } else {
      setSettings(baseSettings);
      setCustomSubject(baseSettings.templateSubject || "");
      setCustomHtml(baseSettings.templateHtml || DEFAULT_TEMPLATE);
      setHasApiKey(false);
      setApiKeyInput("");
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: (payload: SiteConfig) => saveConfig(payload),
    onSuccess: (data) => {
      if (data.emailSettings?.hasMailerLiteApiKey) setHasApiKey(true);
      setApiKeyInput("");
    },
  });

  const sendMutation = useMutation({ mutationFn: sendEmailCampaign });

  const sortedNews = useMemo(() => {
    const list = [...news];
    const toDate = (d?: string) => Date.parse(d || "");
    return list.sort((a, b) => {
      const ad = toDate(a.publishDate);
      const bd = toDate(b.publishDate);
      return (isNaN(bd) ? 0 : bd) - (isNaN(ad) ? 0 : ad);
    });
  }, [news]);

  const togglePlatform = (id: string) => {
    setPlatformIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    const payloadEmailSettings: EmailSettings = {
      ...settings,
      templateSubject: customSubject || settings.templateSubject,
      templateHtml: customHtml || settings.templateHtml,
    };
    if (apiKeyInput.trim()) {
      payloadEmailSettings.mailerLiteApiKey = apiKeyInput.trim();
    }

    const nextConfig: SiteConfig = { ...(config || { id: "global" }), emailSettings: payloadEmailSettings };
    saveMutation.mutate(nextConfig);
  };

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    sendMutation.mutate({
      newsId: newsId || undefined,
      platformIds: sendToAll ? [] : platformIds,
      sendToAll,
      subject: customSubject || settings.templateSubject,
      html: customHtml || settings.templateHtml,
    });
  };

  return (
    <SectionCard title="Email & notifications">
      <div className="mb-4 grid gap-3 text-sm text-slate-200 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Active</div>
          <div className="text-2xl font-semibold text-white">{activeCount}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-300">Unsubscribed</div>
          <div className="text-2xl font-semibold text-white">{unsubCount}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-300">Last sent</div>
          <div className="text-sm text-white">{emailStats?.lastSentAt ? new Date(emailStats.lastSentAt).toLocaleString() : "—"}</div>
          <div className="mt-1 text-xs text-slate-400">
            Total campaigns: {emailStats?.totalCampaigns ?? 0} · Total sent: {emailStats?.totalSent ?? 0}
          </div>
        </div>
      </div>

      <form className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-4" onSubmit={handleSave}>
        <div className="text-sm font-semibold text-slate-100">Template & settings</div>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="input-field"
            placeholder="From name"
            value={settings.fromName || ""}
            onChange={(e) => setSettings({ ...settings, fromName: e.target.value })}
          />
          <input
            className="input-field"
            placeholder="From email (must be verified in ACS)"
            value={settings.fromEmail || ""}
            onChange={(e) => setSettings({ ...settings, fromEmail: e.target.value })}
          />
          <input
            className="input-field"
            placeholder="Manage preferences URL"
            value={settings.manageUrl || ""}
            onChange={(e) => setSettings({ ...settings, manageUrl: e.target.value })}
          />
          <input
            type="number"
            min={1}
            max={490}
            className="input-field"
            placeholder="Batch size (<=490)"
            value={settings.batchSize ?? 490}
            onChange={(e) => setSettings({ ...settings, batchSize: Number(e.target.value) })}
          />
          <label className="flex items-center gap-2 text-sm text-slate-200 md:col-span-2">
            <input
              type="checkbox"
              checked={Boolean(settings.autoNotifyOnNews)}
              onChange={(e) => setSettings({ ...settings, autoNotifyOnNews: e.target.checked })}
            />
            Auto-notify on new news posts (server-side)
          </label>
          <input
            className="input-field md:col-span-2"
            placeholder="Template subject"
            value={customSubject}
            onChange={(e) => setCustomSubject(e.target.value)}
          />
          <textarea
            className="input-field md:col-span-2 min-h-[160px]"
            placeholder="Template HTML"
            value={customHtml}
            onChange={(e) => setCustomHtml(e.target.value)}
          />
          <input
            type="password"
            className="input-field md:col-span-2"
            placeholder={hasApiKey ? "******** (stored)" : "MailerLite API key (optional)"}
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
          />
        </div>
        <div className="text-xs text-slate-400">
          Placeholders: {"{{newsTitle}}"}, {"{{newsUrl}}"}, {"{{manageUrl}}"}, {"{{unsubscribeUrl}}"}, {"{{newsSection}}"}, {"{{platformNames}}"},{" "}
          {"{{newsSummary}}"}, {"{{newsContent}}"}, {"{{imageUrl}}"}.
        </div>
        <button
          type="submit"
          disabled={saveMutation.isPending || !config}
          className="btn btn-primary"
        >
          {saveMutation.isPending ? "Saving..." : "Save settings"}
        </button>
        {saveMutation.isError && <div className="text-sm text-red-300">Save failed.</div>}
        {saveMutation.isSuccess && <div className="text-sm text-emerald-200">Saved.</div>}
      </form>

      <form className="mt-6 space-y-3 rounded-lg border border-white/10 bg-white/5 p-4" onSubmit={handleSend}>
        <div className="text-sm font-semibold text-slate-100">Send notification</div>
        <div className="grid gap-3 md:grid-cols-2">
          <select
            className="input-field"
            value={newsId}
            onChange={(e) => setNewsId(e.target.value)}
          >
            <option value="">Select news post (optional)</option>
            {sortedNews.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
                {n.publishDate ? ` (${n.publishDate})` : ""}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-3 text-sm text-slate-200">
            <label className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">
              <input type="radio" checked={sendToAll} onChange={() => setSendToAll(true)} />
              All subscribers
            </label>
            <label className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">
              <input type="radio" checked={!sendToAll} onChange={() => setSendToAll(false)} />
              Choose platforms
            </label>
          </div>
        </div>

        {!sendToAll && (
          <div className="flex flex-wrap gap-2">
            {platforms.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePlatform(p.id)}
                className={[
                  "rounded-full border px-3 py-1 text-xs transition",
                  platformIds.includes(p.id)
                    ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                    : "border-white/10 text-slate-200 hover:border-white/30",
                ].join(" ")}
              >
                {p.name || p.id}
              </button>
            ))}
            {platforms.length === 0 && <span className="text-xs text-slate-400">No platforms yet.</span>}
          </div>
        )}

        <button
          type="submit"
          disabled={sendMutation.isPending}
          className="btn btn-primary"
        >
          {sendMutation.isPending ? "Queuing..." : "Send notification"}
        </button>
        {sendMutation.isError && (
          <div className="text-sm text-red-300">{(sendMutation.error as Error).message || "Failed to queue email."}</div>
        )}
        {sendMutation.isSuccess && <div className="text-sm text-emerald-200">Email(s) queued.</div>}
      </form>
    </SectionCard>
  );
}

export default AdminEmailSection;
