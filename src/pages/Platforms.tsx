import { useQuery } from "@tanstack/react-query";
import { PlatformCard } from "../components/Cards";
import { Loading } from "../components/Loading";
import SectionCard from "../components/SectionCard";
import { fetchPlatforms, fetchTopics } from "../lib/api";

function Platforms() {
  const { data: platforms = [], isLoading } = useQuery({ queryKey: ["platforms"], queryFn: fetchPlatforms });
  const { data: topics = [] } = useQuery({ queryKey: ["topics"], queryFn: fetchTopics });
  const topicLabels = Object.fromEntries(topics.map((t) => [t.id, t.name]));

  return (
    <SectionCard title="Platforms">
      {isLoading ? (
        <Loading label="Loading platforms..." />
      ) : platforms.length ? (
        <div className="grid gap-4 md:grid-cols-3">
          {platforms
            .slice()
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
            .map((platform) => (
              <PlatformCard key={platform.id} platform={platform} topicLabels={topicLabels} />
            ))}
        </div>
      ) : (
        <div className="text-slate-300">No platforms available yet.</div>
      )}
    </SectionCard>
  );
}

export default Platforms;
