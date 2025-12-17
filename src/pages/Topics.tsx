import { useQuery } from "@tanstack/react-query";
import { TopicCard } from "../components/Cards";
import { Loading } from "../components/Loading";
import SectionCard from "../components/SectionCard";
import { fetchTopics } from "../lib/api";

function Topics() {
  const { data: topics = [], isLoading } = useQuery({ queryKey: ["topics"], queryFn: fetchTopics });
  const sorted = [...topics].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <SectionCard title="Topics">
      {isLoading ? (
        <Loading label="Loading topics..." />
      ) : topics.length ? (
        <div className="grid gap-4 md:grid-cols-3">
          {sorted.map((topic) => (
            <TopicCard key={topic.id} topic={topic} />
          ))}
        </div>
      ) : (
        <div className="text-slate-300">No topics available.</div>
      )}
    </SectionCard>
  );
}

export default Topics;
