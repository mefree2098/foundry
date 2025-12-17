import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchNews, fetchPlatforms, fetchTopics } from "../lib/api";
import { NewsCard } from "../components/Cards";
import { ErrorState, Loading } from "../components/Loading";
import SectionCard from "../components/SectionCard";
import { SmartLinkButtons } from "../components/SmartLinkButtons";

function PlatformDetail() {
  const { platformSlug } = useParams();
  const [sort, setSort] = useState<"newest" | "oldest" | "alpha">("newest");
  const { data: platforms = [] } = useQuery({ queryKey: ["platforms"], queryFn: fetchPlatforms });
  const { data: topics = [] } = useQuery({ queryKey: ["topics"], queryFn: fetchTopics });
  const topicLabels = useMemo(() => Object.fromEntries(topics.map((t) => [t.id, t.name])), [topics]);
  const platform = useMemo(() => platforms.find((p) => p.id === platformSlug), [platforms, platformSlug]);

  const { data: news = [], isLoading, isError } = useQuery({
    queryKey: ["news", { platformId: platformSlug }],
    queryFn: () => fetchNews({ platformId: platformSlug }),
    enabled: Boolean(platformSlug),
  });

  const sortedNews = useMemo(() => {
    const list = [...news];
    if (sort === "alpha") {
      return list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }
    const toDate = (d?: string) => Date.parse(d || "");
    return list.sort((a, b) => {
      const ad = toDate(a.publishDate);
      const bd = toDate(b.publishDate);
      if (isNaN(ad) && isNaN(bd)) return 0;
      if (isNaN(ad)) return 1;
      if (isNaN(bd)) return -1;
      return sort === "newest" ? bd - ad : ad - bd;
    });
  }, [news, sort]);

  if (!platform) {
    return (
      <SectionCard title="Platform">
        <ErrorState message="Platform not found." />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard title={platform.name}>
        {platform.heroImageUrl && (
          <img
            src={platform.heroImageUrl}
            alt={platform.name}
            className="mb-4 w-full max-h-[700px] rounded-2xl bg-slate-900/50 object-contain ring-1 ring-white/10"
            loading="lazy"
          />
        )}
        <p className="text-sm text-slate-200">{platform.description || platform.summary || "Details coming soon."}</p>
        <SmartLinkButtons links={platform.links} />
        {platform.topics && platform.topics.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {platform.topics.map((t) => (
              <span key={t} className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-200">
                {topicLabels[t] || t}
              </span>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="News & updates">
        <div className="mb-3 flex flex-wrap gap-2 text-sm text-slate-200">
          <select
            className="rounded-full border border-white/10 bg-slate-900 px-3 py-2 text-slate-100"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
          >
            <option value="newest">Newest to oldest</option>
            <option value="oldest">Oldest to newest</option>
            <option value="alpha">Alphabetical</option>
          </select>
        </div>
        {isLoading ? (
          <Loading label="Loading updates..." />
        ) : isError ? (
          <ErrorState />
        ) : news.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {sortedNews.map((item) => (
              <NewsCard key={item.id} news={item} platformLabels={{ [platform.id]: platform.name }} />
            ))}
          </div>
        ) : (
          <div className="text-slate-300">No updates yet.</div>
        )}
      </SectionCard>
    </div>
  );
}

export default PlatformDetail;
