import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NewsCard, PlatformCard, TopicCard } from "../components/Cards";
import Hero from "../components/Hero";
import AiProviders from "../components/AiProviders";
import NewsletterCTA from "../components/NewsletterCTA";
import SectionCard from "../components/SectionCard";
import { fetchConfig, fetchNews, fetchPlatforms, fetchTopics } from "../lib/api";
import { KeyRound, ShieldCheck, Shuffle } from "lucide-react";

const trustIconMap = {
  key: KeyRound,
  shield: ShieldCheck,
  shuffle: Shuffle,
  KeyRound,
  ShieldCheck,
  Shuffle,
} as const;

const defaultSections = [
  { id: "trust", type: "trust", enabled: true },
  { id: "ai", type: "ai", enabled: true },
  { id: "platforms", type: "platforms", enabled: true, maxItems: 6, title: "Featured platforms" },
  { id: "news", type: "news", enabled: true, maxItems: 6, title: "Latest news" },
  { id: "topics", type: "topics", enabled: true, maxItems: 6, title: "Explore by topic" },
  { id: "newsletter", type: "newsletter", enabled: true },
] as const;

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

  const siteName = config?.siteName || "Foundry";

  const heroTitle = config?.heroTitle || "AI-native business platforms";
  const heroSubtitle =
    config?.heroSubtitle ||
    "Purpose-built software that keeps your options open: bring your own AI provider, keep your data in your systems, and ship outcomes faster.";
  const heroBadges =
    config?.heroBadges && config.heroBadges.length > 0
      ? config.heroBadges
      : ["Bring your own AI key", "No vendor lock-in", "Enterprise-ready delivery"];
  const heroCtaText = config?.heroCtaText || "Get in touch";
  const heroCtaUrl = config?.heroCtaUrl || "mailto:hello@example.com?subject=Foundry%20Site";

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

  const sections = (config?.home?.sections?.length ? config.home.sections : (defaultSections as any)).filter(
    (s: any) => (s?.enabled ?? true) && s?.type,
  ) as any[];

  return (
    <div className="space-y-10">
      {config ? (
        <Hero
          brandName={siteName}
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

      {sections.map((section) => {
        const type = String(section.type || "").toLowerCase();
        const title = typeof section.title === "string" ? section.title : undefined;
        const subtitle = typeof section.subtitle === "string" ? section.subtitle : undefined;
        const maxItems = typeof section.maxItems === "number" ? section.maxItems : undefined;

        if (type === "trust") {
          const trustTitle = title || config?.home?.trustSection?.title || "Trust & control";
          const cards =
            config?.home?.trustSection?.cards?.length
              ? config.home.trustSection.cards
              : [
                  {
                    id: "bring-your-own-ai",
                    title: "Bring your own AI",
                    body: "Use the AI provider your organization prefers by supplying your own API key (no custom models, no lock-in).",
                    icon: "key",
                    iconColor: "var(--color-accent)",
                  },
                  {
                    id: "keep-control-of-data",
                    title: "Keep control of data",
                    body: "Platforms are designed to fit your workflows while keeping your systems and policies at the center.",
                    icon: "shield",
                    iconColor: "var(--color-secondary)",
                  },
                  {
                    id: "switch-when-you-need-to",
                    title: "Switch when you need to",
                    body: "Change providers as capabilities and pricing evolve-without rewriting the business platform around it.",
                    icon: "shuffle",
                    iconColor: "var(--color-accent)",
                  },
                ];
          return (
            <SectionCard key={section.id} title={trustTitle}>
              <div className="grid gap-4 md:grid-cols-3">
                {cards.map((card) => {
                  const Icon = (card.icon && (trustIconMap as any)[card.icon]) || undefined;
                  return (
                    <div key={card.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-50">
                        {Icon ? (
                          <Icon className="h-4 w-4" style={card.iconColor ? { color: card.iconColor } : undefined} />
                        ) : null}
                        {card.title}
                      </div>
                      <p className="mt-2 text-sm text-slate-200">{card.body}</p>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          );
        }

        if (type === "ai") {
          return (
            <AiProviders
              key={section.id}
              title={title || config?.home?.aiSection?.title}
              subtitle={subtitle || config?.home?.aiSection?.subtitle}
              footnote={config?.home?.aiSection?.footnote}
              providers={config?.home?.aiSection?.providers}
            />
          );
        }

        if (type === "platforms") {
          const list = featuredPlatforms.slice(0, maxItems || 6);
          return (
            <SectionCard key={section.id} title={title || "Featured platforms"}>
              {platformsLoading ? (
                <div>Loading platforms.</div>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  {list.map((platform) => (
                    <PlatformCard key={platform.id} platform={platform} topicLabels={topicLabels} />
                  ))}
                  {platforms.length === 0 && <div className="text-slate-300">No platforms yet-add some via admin.</div>}
                </div>
              )}
            </SectionCard>
          );
        }

        if (type === "news") {
          const list = sortedNews.slice(0, maxItems || 6);
          return (
            <SectionCard key={section.id} title={title || "Latest news"}>
              {newsLoading ? (
                <div>Loading news.</div>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  {list.map((item) => (
                    <NewsCard key={item.id} news={item} platformLabels={platformLabels} />
                  ))}
                  {news.length === 0 && <div className="text-slate-300">No news yet-add some via admin.</div>}
                </div>
              )}
            </SectionCard>
          );
        }

        if (type === "topics") {
          const list = featuredTopics.slice(0, maxItems || 6);
          return (
            <SectionCard key={section.id} title={title || "Explore by topic"}>
              {topicsLoading ? (
                <div>Loading topics.</div>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  {list.map((topic) => (
                    <TopicCard key={topic.id} topic={topic} />
                  ))}
                  {topics.length === 0 && <div className="text-slate-300">No topics yet-add some via admin.</div>}
                </div>
              )}
            </SectionCard>
          );
        }

        if (type === "richtext") {
          const markdown = typeof section.markdown === "string" ? section.markdown : "";
          return (
            <SectionCard key={section.id} title={title || "Section"}>
              {subtitle ? <div className="mb-2 text-sm text-slate-300">{subtitle}</div> : null}
              <div className="whitespace-pre-line text-sm text-slate-200">{markdown}</div>
            </SectionCard>
          );
        }

        if (type === "cta") {
          const cta = (section.cta || {}) as any;
          const primaryText = (cta.primaryText as string | undefined) || "Learn more";
          const primaryHref = (cta.primaryHref as string | undefined) || "/about";
          const secondaryText = (cta.secondaryText as string | undefined) || "";
          const secondaryHref = (cta.secondaryHref as string | undefined) || "";
          return (
            <SectionCard key={section.id} title={title || "Get started"}>
              {subtitle ? <div className="mb-3 text-sm text-slate-200">{subtitle}</div> : null}
              <div className="flex flex-wrap gap-3">
                <a className="btn btn-primary" href={primaryHref}>
                  {primaryText}
                </a>
                {secondaryText && secondaryHref ? (
                  <a className="btn btn-secondary" href={secondaryHref}>
                    {secondaryText}
                  </a>
                ) : null}
              </div>
            </SectionCard>
          );
        }

        if (type === "newsletter") {
          return <NewsletterCTA key={section.id} />;
        }

        return null;
      })}
    </div>
  );
}

export default Home;
