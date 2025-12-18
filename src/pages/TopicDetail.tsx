import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { NewsCard, PlatformCard } from "../components/Cards";
import { ErrorState, Loading } from "../components/Loading";
import SectionCard from "../components/SectionCard";
import { EmbedBlock } from "../components/EmbedBlock";
import { fetchNews, fetchPlatforms, fetchTopics } from "../lib/api";

function TopicDetail() {
  const { topicSlug } = useParams();
  const { data: topics = [] } = useQuery({ queryKey: ["topics"], queryFn: fetchTopics });
  const topicLabels = useMemo(() => Object.fromEntries(topics.map((t) => [t.id, t.name])), [topics]);
  const topic = useMemo(() => topics.find((t) => t.id === topicSlug), [topics, topicSlug]);

  const { data: platforms = [] } = useQuery({ queryKey: ["platforms"], queryFn: fetchPlatforms });
  const platformsForTopic = useMemo(
    () => platforms.filter((p) => p.topics?.includes(topicSlug || "")),
    [platforms, topicSlug],
  );
  const platformLabelMap = useMemo(
    () => Object.fromEntries(platforms.map((p) => [p.id, p.name])),
    [platforms],
  );

  const { data: news = [], isLoading, isError } = useQuery({
    queryKey: ["news", { topic: topicSlug }],
    queryFn: () => fetchNews({ topic: topicSlug }),
    enabled: Boolean(topicSlug),
  });

  const embedHtml = typeof topic?.custom?.["embedHtml"] === "string" ? String(topic.custom?.["embedHtml"]) : "";
  const embedHeightRaw = topic?.custom?.["embedHeight"];
  const embedHeight = typeof embedHeightRaw === "number" ? embedHeightRaw : Number(embedHeightRaw) || undefined;
  const embedConfig = embedHtml ? ({ mode: "html", html: embedHtml, height: embedHeight } as const) : undefined;

  return (
    <div className="space-y-6">
      <SectionCard title={topic ? topic.name : "Topic"}>
        {embedConfig ? <EmbedBlock embed={embedConfig} className="mb-4" /> : null}
        {topic?.description ? (
          <p className="text-sm text-slate-200">{topic.description}</p>
        ) : (
          <p className="text-sm text-slate-200">Topic detail coming soon.</p>
        )}
      </SectionCard>

      <SectionCard title="Platforms">
        {platformsForTopic.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {platformsForTopic.map((platform) => (
              <PlatformCard key={platform.id} platform={platform} topicLabels={topicLabels} />
            ))}
          </div>
        ) : (
          <div className="text-slate-300">No platforms in this topic yet.</div>
        )}
      </SectionCard>

      <SectionCard title="News">
        {isLoading ? (
          <Loading label="Loading news..." />
        ) : isError ? (
          <ErrorState />
        ) : news.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {news.map((item) => (
              <NewsCard key={item.id} news={item} platformLabels={platformLabelMap} />
            ))}
          </div>
        ) : (
          <div className="text-slate-300">No news in this topic yet.</div>
        )}
      </SectionCard>
    </div>
  );
}

export default TopicDetail;
