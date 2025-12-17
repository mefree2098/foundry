import SectionCard from "./SectionCard";
import { AI_PROVIDERS } from "../lib/aiProviders";

function AiProviders() {
  return (
    <SectionCard title="Bring your own AI">
      <p className="text-sm text-slate-200">
        NTR platforms are AI-native by design, but we avoid lock-in. Use the AI provider your organization prefers by supplying your own API key.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AI_PROVIDERS.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <img
              src={p.icon}
              alt={p.label}
              className="h-6 w-6 rounded bg-white/90 p-[3px]"
              loading="lazy"
              onError={(e) => ((e.currentTarget.style.display = "none"), e.preventDefault())}
            />
            <div className="text-sm font-semibold text-slate-50">{p.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">Examples shown; supported options can vary by platform.</p>
    </SectionCard>
  );
}

export default AiProviders;

