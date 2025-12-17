import { ExternalLink } from "lucide-react";

type LinkMap = Record<string, string>;

function isLikelyUrl(value: string) {
  return /^https?:\/\//i.test(value) || /^mailto:/i.test(value);
}

export function SmartLinkButtons({ links }: { links?: LinkMap }) {
  const entries = Object.entries(links || {}).filter(([label, url]) => Boolean(label) && Boolean(url) && isLikelyUrl(url));
  if (!entries.length) return null;

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {entries.map(([label, url]) => (
        <a
          key={`${label}:${url}`}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-50 transition hover:-translate-y-0.5 hover:border-ntr-magenta/60"
        >
          <span className="flex items-center gap-2">{label}</span>
          <ExternalLink className="h-4 w-4 text-ntr-magenta" />
        </a>
      ))}
    </div>
  );
}
