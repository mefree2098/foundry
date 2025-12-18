import type { NewsPost, Platform, Topic } from "../lib/types";
import { Link } from "react-router-dom";

export function PlatformCard({
  platform,
  topicLabels,
}: {
  platform: Platform;
  topicLabels?: Record<string, string>;
}) {
  const topics = platform.topics || [];
  return (
    <Link
      to={`/platforms/${platform.id}`}
      className="block rounded-2xl border border-white/5 bg-white/5 p-5 transition hover:-translate-y-1 hover:border-ntr-magenta/60"
    >
      <div className="flex items-center gap-4">
        {platform.heroImageUrl ? (
          <img
            src={platform.heroImageUrl}
            alt={platform.name}
            className="h-16 w-16 rounded-xl object-cover ring-1 ring-white/10"
            loading="lazy"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white/10 text-lg font-semibold text-slate-200">
            {platform.name?.[0] || "?"}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold text-slate-50">{platform.name}</div>
          {platform.tagline && <div className="mt-0.5 line-clamp-2 text-sm text-slate-300">{platform.tagline}</div>}
        </div>
      </div>

      {platform.summary && <p className="mt-3 text-sm text-slate-200 line-clamp-3">{platform.summary}</p>}

      {topics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {topics.slice(0, 6).map((t) => (
            <span key={t} className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-200">
              {topicLabels?.[t] || t}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

export function NewsCard({
  news,
  platformLabels,
}: {
  news: NewsPost;
  platformLabels?: Record<string, string>;
}) {
  const related = (news.platformIds || []).map((id) => platformLabels?.[id] || id).filter(Boolean);
  const statusLabel = news.status === "Draft" ? "Draft" : "Published";

  return (
    <Link
      to={`/news/${news.id}`}
      className="block rounded-2xl border border-white/5 bg-white/5 p-5 transition hover:-translate-y-1 hover:border-ntr-magenta/60"
    >
      <div className="flex items-start gap-4">
        {news.imageUrl ? (
          <img
            src={news.imageUrl}
            alt={news.imageAlt || news.title}
            className="h-16 w-16 rounded-lg object-cover ring-1 ring-white/10"
            loading="lazy"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-white/10 text-xs uppercase tracking-wide text-slate-200">
            {news.type || "News"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wide text-ntr-magenta">{news.type || "Update"}</div>
          <div className="mt-1 text-lg font-semibold text-slate-50 line-clamp-2">{news.title}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
            <span
              className={[
                "rounded-full px-2 py-1",
                statusLabel === "Draft" ? "bg-amber-400/20 text-amber-100" : "bg-ntr-emerald-bright/20 text-ntr-emerald-bright",
              ].join(" ")}
            >
              {statusLabel}
            </span>
            {news.publishDate && <span>{news.publishDate}</span>}
          </div>
          {news.summary && <p className="mt-2 text-sm text-slate-200 line-clamp-2">{news.summary}</p>}
          {related.length > 0 && (
            <div className="mt-2 text-xs text-slate-400">
              Related: {related.slice(0, 3).join(", ")}
              {related.length > 3 ? "…" : ""}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export function TopicCard({ topic }: { topic: Topic }) {
  return (
    <Link
      to={`/topics/${topic.id}`}
      className="block rounded-2xl border border-white/5 bg-white/5 p-5 transition hover:-translate-y-1 hover:border-ntr-magenta/60"
    >
      <div className="text-lg font-semibold text-slate-50">{topic.name}</div>
      {topic.description && <p className="mt-2 text-sm text-slate-300 line-clamp-3">{topic.description}</p>}
    </Link>
  );
}
