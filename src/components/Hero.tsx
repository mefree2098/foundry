import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

type HeroProps = {
  brandName?: string;
  title: string;
  subtitle: string;
  badges?: string[];
  ctaText?: string;
  ctaHref?: string;
  secondaryCtaText?: string;
  secondaryCtaHref?: string;
};

function isHttpUrl(href: string) {
  return /^https?:\/\//i.test(href);
}

function isMailto(href: string) {
  return /^mailto:/i.test(href);
}

function Hero({ brandName = "Foundry", title, subtitle, badges = [], ctaText, ctaHref, secondaryCtaText, secondaryCtaHref }: HeroProps) {
  const primaryHref = ctaHref?.trim();
  const secondaryHref = secondaryCtaHref?.trim();

  return (
    <section className="rounded-3xl border border-white/5 bg-white/5 px-8 py-10 shadow-2xl shadow-ntr-emerald/15">
      <p className="text-sm uppercase tracking-[0.3em] text-ntr-emerald-bright">{brandName}</p>
      <h1 className="mt-3 text-4xl font-semibold text-slate-50 sm:text-5xl">{title}</h1>
      <p className="mt-4 max-w-3xl text-lg text-slate-200">{subtitle}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {badges.map((badge) => (
          <span
            key={badge}
            className="rounded-full bg-ntr-emerald-bright/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ntr-emerald-bright"
          >
            {badge}
          </span>
        ))}
      </div>
      {(primaryHref || secondaryHref) && (
        <div className="mt-8 flex flex-wrap gap-3">
          {primaryHref ? (
            isHttpUrl(primaryHref) || isMailto(primaryHref) ? (
              <a
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-ntr-magenta px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-ntr-magenta/20 transition hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-ntr-magenta/50"
                href={primaryHref}
                target={isHttpUrl(primaryHref) ? "_blank" : undefined}
                rel={isHttpUrl(primaryHref) ? "noreferrer" : undefined}
              >
                {ctaText}
                <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            ) : (
              <Link
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-ntr-magenta px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-ntr-magenta/20 transition hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-ntr-magenta/50"
                to={primaryHref}
              >
                {ctaText}
                <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            )
          ) : null}

          {secondaryHref ? (
            isHttpUrl(secondaryHref) || isMailto(secondaryHref) ? (
              <a
                className="glass-surface group inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-ntr-emerald-bright transition hover:-translate-y-0.5 hover:border-ntr-emerald-bright/70 hover:text-white"
                href={secondaryHref}
                target={isHttpUrl(secondaryHref) ? "_blank" : undefined}
                rel={isHttpUrl(secondaryHref) ? "noreferrer" : undefined}
              >
                {secondaryCtaText}
                <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            ) : (
              <Link
                className="glass-surface group inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-ntr-emerald-bright transition hover:-translate-y-0.5 hover:border-ntr-emerald-bright/70 hover:text-white"
                to={secondaryHref}
              >
                {secondaryCtaText}
                <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            )
          ) : null}
        </div>
      )}
    </section>
  );
}

export default Hero;
