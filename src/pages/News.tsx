import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NewsCard } from "../components/Cards";
import { ErrorState, Loading } from "../components/Loading";
import SectionCard from "../components/SectionCard";
import { fetchNews, fetchPlatforms, fetchTopics } from "../lib/api";

function News() {
  const [filter, setFilter] = useState<{ platformId?: string; topic?: string }>({});
  const [sort, setSort] = useState<"newest" | "oldest" | "alpha">("newest");
  const { data: platforms = [] } = useQuery({ queryKey: ["platforms"], queryFn: fetchPlatforms });
  const { data: topics = [] } = useQuery({ queryKey: ["topics"], queryFn: fetchTopics });
  const { data: news = [], isLoading } = useQuery({
    queryKey: ["news", filter],
    queryFn: () => fetchNews(filter),
  });

  const platformLabels = useMemo(() => Object.fromEntries(platforms.map((p) => [p.id, p.name])), [platforms]);
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

  return (
    <SectionCard title="News">
      <div className="mb-4 flex flex-wrap gap-3 text-sm text-slate-200">
        <select
          className="rounded-full border border-white/10 bg-slate-900 px-3 py-2 text-slate-100"
          value={filter.platformId || ""}
          onChange={(e) => setFilter((f) => ({ ...f, platformId: e.target.value || undefined }))}
        >
          <option value="">All platforms</option>
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className="rounded-full border border-white/10 bg-slate-900 px-3 py-2 text-slate-100"
          value={filter.topic || ""}
          onChange={(e) => setFilter((f) => ({ ...f, topic: e.target.value || undefined }))}
        >
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
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
        <Loading label="Loading news..." />
      ) : news.length ? (
        <div className="grid gap-4 md:grid-cols-3">
          {sortedNews.map((item) => (
            <NewsCard key={item.id} news={item} platformLabels={platformLabels} />
          ))}
        </div>
      ) : (
        <ErrorState message="No news available." />
      )}
    </SectionCard>
  );
}

export default News;
