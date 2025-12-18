import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchNews, fetchPlatforms, fetchTopics } from "../lib/api";
import SectionCard from "../components/SectionCard";
import { SmartLinkButtons } from "../components/SmartLinkButtons";

function NewsDetail() {
  const { newsSlug } = useParams();
  const { data: news = [] } = useQuery({ queryKey: ["news", { all: true }], queryFn: () => fetchNews() });
  const item = useMemo(() => news.find((n) => n.id === newsSlug), [news, newsSlug]);
  const { data: platforms = [] } = useQuery({ queryKey: ["platforms"], queryFn: fetchPlatforms });
  const { data: topics = [] } = useQuery({ queryKey: ["topics"], queryFn: fetchTopics });
  const platformLabels = useMemo(() => Object.fromEntries(platforms.map((p) => [p.id, p.name])), [platforms]);
  const topicLabels = useMemo(() => Object.fromEntries(topics.map((t) => [t.id, t.name])), [topics]);

  if (!item) {
    return (
      <SectionCard title="Update">
        <div className="text-slate-300">Update not found.</div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard title={item.title}>
        {item.imageUrl && (
          <img
            src={item.imageUrl}
            alt={item.imageAlt || item.title}
            className="mb-4 w-full max-h-[700px] rounded-2xl bg-slate-900/50 object-contain ring-1 ring-white/10"
            loading="lazy"
          />
        )}
        <div className="text-sm text-slate-200">
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
            <span
              className={[
                "rounded-full px-2 py-1",
                item.status === "Draft" ? "bg-amber-400/20 text-amber-100" : "bg-emerald-400/20 text-emerald-100",
              ].join(" ")}
            >
              {item.status || "Published"}
            </span>
            {item.type && <span className="rounded-full bg-white/10 px-2 py-1">{item.type}</span>}
            {item.publishDate && <span>{item.publishDate}</span>}
          </div>
          {item.summary && <p className="mt-4 whitespace-pre-line">{item.summary}</p>}
          {item.content && <div className="mt-4 whitespace-pre-line text-slate-200">{item.content}</div>}
        </div>

        <SmartLinkButtons links={item.links} />

        {item.platformIds && item.platformIds.length > 0 && (
          <div className="mt-6">
            <div className="text-xs uppercase tracking-wide text-slate-400">Related platforms</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.platformIds.map((id) => (
                <Link
                  key={id}
                  to={`/platforms/${id}`}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-100 transition hover:border-emerald-300/50"
                >
                  {platformLabels[id] || id}
                </Link>
              ))}
            </div>
          </div>
        )}

        {item.topics && item.topics.length > 0 && (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">Topics</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.topics.map((id) => (
                <Link
                  key={id}
                  to={`/topics/${id}`}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-100 transition hover:border-emerald-300/50"
                >
                  {topicLabels[id] || id}
                </Link>
              ))}
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export default NewsDetail;
