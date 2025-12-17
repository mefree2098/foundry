import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NewsCard, PlatformCard, TopicCard } from "../components/Cards";
import Hero from "../components/Hero";
import AiProviders from "../components/AiProviders";
import NewsletterCTA from "../components/NewsletterCTA";
import SectionCard from "../components/SectionCard";
import { fetchConfig, fetchNews, fetchPlatforms, fetchTopics } from "../lib/api";
import { KeyRound, ShieldCheck, Shuffle } from "lucide-react";

function Home() {
  const queryClient = useQueryClient();
  const cachedPlatforms = queryClient.getQueryData(["platforms"]) as Awaited<ReturnType<typeof fetchPlatforms>> | undefined;
  const cachedNews = queryClient.getQueryData(["news", { limit: 6 }]) as
    | Awaited<ReturnType<typeof fetchNews>>
    | undefined;
  const cachedTopics = queryClient.getQueryData(["topics"]) as Awaited<ReturnType<typeof fetchTopics>> | undefined;
  const cachedConfig = queryClient.getQueryData(["config"]) as Awaited<ReturnType<typeof fetchConfig>> | undefined;

  const { data: platforms = [], isLoading: platformsLoading } = useQuery({
    queryKey: ["platforms"],
    queryFn: fetchPlatforms,
    placeholderData: cachedPlatforms,
  });
  const { data: news = [], isLoading: newsLoading } = useQuery({
    queryKey: ["news", { limit: 6 }],
    queryFn: () => fetchNews(),
    placeholderData: cachedNews,
  });
  const { data: topics = [], isLoading: topicsLoading } = useQuery({
    queryKey: ["topics"],
    queryFn: fetchTopics,
    placeholderData: cachedTopics,
  });
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: fetchConfig,
    placeholderData: cachedConfig,
  });

  const heroTitle = config?.heroTitle || "AI-native business platforms";
  const heroSubtitle =
    config?.heroSubtitle ||
    "Purpose-built software that keeps your options open: bring your own AI provider, keep your data in your systems, and ship outcomes faster.";
  const heroBadges =
    config?.heroBadges && config.heroBadges.length > 0
      ? config.heroBadges
      : ["Bring your own AI key", "No vendor lock-in", "Enterprise-ready delivery"];
  const heroCtaText = config?.heroCtaText || "Request a demo";
  const heroCtaUrl = config?.heroCtaUrl || "mailto:contact@ntechr.com?subject=NTR%20Demo%20Request";

  const normalizedCtaUrl = (heroCtaUrl || "").trim().replace(/\/$/, "");
  const isPlatformsCta = normalizedCtaUrl === "/platforms" || normalizedCtaUrl.endsWith("/platforms");
  const secondaryCtaText = isPlatformsCta ? "Learn more" : "Explore platforms";
  const secondaryCtaHref = isPlatformsCta ? "/about" : "/platforms";

  const featuredIds = config?.featuredPlatformIds || [];
  const featuredPlatforms =
    featuredIds.length > 0
      ? featuredIds
          .map((id) => platforms.find((p) => p.id === id))
          .filter((p): p is typeof platforms[number] => Boolean(p))
      : platforms.slice(0, 6);

  const featuredTopicIds = config?.featuredTopicIds || [];
  const featuredTopics =
    featuredTopicIds.length > 0
      ? featuredTopicIds
          .map((id) => topics.find((t) => t.id === id))
          .filter((t): t is typeof topics[number] => Boolean(t))
      : topics;

  const sortedNews = [...news].sort((a, b) => {
    const aDate = Date.parse(a.publishDate || "");
    const bDate = Date.parse(b.publishDate || "");
    return (isNaN(bDate) ? 0 : bDate) - (isNaN(aDate) ? 0 : aDate);
  });
  const platformLabels = Object.fromEntries(platforms.map((p) => [p.id, p.name]));
  const topicLabels = Object.fromEntries(topics.map((t) => [t.id, t.name]));

  return (
    <div className="space-y-10">
      {config ? (
        <Hero
          title={heroTitle}
          subtitle={heroSubtitle}
          badges={heroBadges}
          ctaText={heroCtaText}
          ctaHref={heroCtaUrl}
          secondaryCtaText={secondaryCtaText}
          secondaryCtaHref={secondaryCtaHref}
        />
      ) : (
        <SectionCard title="Loading...">
          <div className="h-40 animate-pulse rounded-2xl bg-white/5" />
        </SectionCard>
      )}

      <SectionCard title="Trust & control">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-50">
              <KeyRound className="h-4 w-4 text-ntr-magenta" />
              Bring your own AI
            </div>
            <p className="mt-2 text-sm text-slate-200">
              Use the AI provider your organization prefers by supplying your own API key (no custom models, no lock-in).
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-50">
              <ShieldCheck className="h-4 w-4 text-ntr-emerald-bright" />
              Keep control of data
            </div>
            <p className="mt-2 text-sm text-slate-200">
              Platforms are designed to fit your workflows while keeping your systems and policies at the center.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-50">
              <Shuffle className="h-4 w-4 text-ntr-magenta" />
              Switch when you need to
            </div>
            <p className="mt-2 text-sm text-slate-200">
              Change providers as capabilities and pricing evolve-without rewriting the business platform around it.
            </p>
          </div>
        </div>
      </SectionCard>

      <AiProviders />

      <SectionCard title="Featured platforms">
        {platformsLoading ? (
          <div>Loading platforms.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {featuredPlatforms.slice(0, 6).map((platform) => (
              <PlatformCard key={platform.id} platform={platform} topicLabels={topicLabels} />
            ))}
            {platforms.length === 0 && <div className="text-slate-300">No platforms yet—add some via admin.</div>}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Latest news">
        {newsLoading ? (
          <div>Loading news.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {sortedNews.slice(0, 6).map((item) => (
              <NewsCard key={item.id} news={item} platformLabels={platformLabels} />
            ))}
            {news.length === 0 && <div className="text-slate-300">No news yet—add some via admin.</div>}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Explore by topic">
        {topicsLoading ? (
          <div>Loading topics.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {featuredTopics.slice(0, 6).map((topic) => (
              <TopicCard key={topic.id} topic={topic} />
            ))}
            {topics.length === 0 && <div className="text-slate-300">No topics yet—add some via admin.</div>}
          </div>
        )}
      </SectionCard>

      <NewsletterCTA />
    </div>
  );
}

export default Home;
