import type { ReactNode } from "react";
import SectionCard from "./SectionCard";
import { AI_PROVIDERS, type AiProvider } from "../lib/aiProviders";

type AiProvidersProps = {
  title?: string;
  subtitle?: string;
  footnote?: string;
  providers?: AiProvider[];
  embed?: ReactNode;
};

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function iconToUrl(icon: string | undefined) {
  const trimmed = (icon || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/") || isHttpUrl(trimmed)) return trimmed;
  // Treat as SimpleIcons slug.
  return `https://cdn.simpleicons.org/${encodeURIComponent(trimmed)}`;
}

function AiProviders({ title = "Bring your own AI", subtitle, footnote, providers, embed }: AiProvidersProps) {
  const list = providers && providers.length ? providers : AI_PROVIDERS;
  return (
    <SectionCard title={title}>
      {embed}
      <p className="text-sm text-slate-200">
        {subtitle ||
          "Foundry sites are AI-friendly by design, but we avoid lock-in. Use the AI provider your organization prefers by supplying your own API key."}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <img
              src={iconToUrl(p.icon)}
              alt={p.label}
              className="h-6 w-6 rounded bg-white/90 p-[3px]"
              loading="lazy"
              onError={(e) => ((e.currentTarget.style.display = "none"), e.preventDefault())}
            />
            <div className="text-sm font-semibold text-slate-50">{p.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">{footnote || "Examples shown; supported options can vary by platform."}</p>
    </SectionCard>
  );
}

export default AiProviders;
