import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, Link } from "react-router-dom";
import { fetchConfig } from "../lib/api";
import { Menu, X } from "lucide-react";
import { applyThemeFromConfig } from "../theme/applyTheme";

const defaultNavLinks = [
  { id: "home", label: "Home", href: "/", newTab: false },
  { id: "platforms", label: "Platforms", href: "/platforms", newTab: false },
  { id: "news", label: "News", href: "/news", newTab: false },
  { id: "topics", label: "Topics", href: "/topics", newTab: false },
  { id: "subscribe", label: "Subscribe", href: "/subscribe", newTab: false },
  { id: "about", label: "About", href: "/about", newTab: false },
  { id: "admin", label: "Admin", href: "/admin", newTab: false },
];

function isInternalHref(href: string) {
  return href.startsWith("/");
}

function Layout() {
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: fetchConfig });
  const brandLogo = config?.logoUrl || "/img/ntr-logo-64.png";
  const brandName = config?.siteName || "Foundry";
  const footerTagline = config?.footerTagline || "AI-native sites and apps, powered by your AI";
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks =
    config?.nav?.links && config.nav.links.length
      ? config.nav.links.filter((l) => (l.enabled ?? true) && l.label && l.href)
      : defaultNavLinks;

  useEffect(() => {
    applyThemeFromConfig(config);
  }, [config]);

  useEffect(() => {
    if (!brandLogo) return;
    const existing = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (existing) {
      existing.href = brandLogo;
      existing.type = "image/png";
    } else {
      const link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/png";
      link.href = brandLogo;
      document.head.appendChild(link);
    }
  }, [brandLogo]);

  return (
    <div className="min-h-screen text-slate-100">
      <header className="relative z-10 border-b border-white/5 bg-slate-950/60 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            {brandLogo ? (
              <img
                src={brandLogo}
                alt={brandName}
                className="h-9 w-9 rounded-full bg-transparent object-contain ring-1 ring-white/10"
              />
            ) : null}
            <div className="text-lg font-semibold tracking-tight text-ntr-emerald-bright">{brandName}</div>
          </Link>
          <div className="flex items-center gap-4 text-sm font-medium">
            <button
              className="inline-flex items-center justify-center rounded-full p-2 text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-ntr-magenta sm:hidden"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="hidden items-center gap-4 sm:flex">
              {navLinks.map((link) =>
                isInternalHref(link.href) ? (
                  <NavLink
                    key={link.id}
                    to={link.href}
                    className={({ isActive }) =>
                      [
                        "rounded-full px-3 py-2 transition",
                        isActive ? "bg-ntr-emerald/20 text-ntr-emerald-bright" : "text-slate-200 hover:text-white",
                      ].join(" ")
                    }
                  >
                    {link.label}
                  </NavLink>
                ) : (
                  <a
                    key={link.id}
                    href={link.href}
                    target={link.newTab ? "_blank" : undefined}
                    rel={link.newTab ? "noreferrer" : undefined}
                    className="rounded-full px-3 py-2 text-slate-200 transition hover:text-white"
                  >
                    {link.label}
                  </a>
                ),
              )}
            </div>
          </div>
        </nav>
        {menuOpen && (
          <div className="sm:hidden">
            <div className="mx-4 mb-4 space-y-2 rounded-2xl border border-white/10 bg-slate-950/80 p-3 shadow-lg backdrop-blur">
              {navLinks.map((link) =>
                isInternalHref(link.href) ? (
                  <NavLink
                    key={link.id}
                    to={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      [
                        "block rounded-xl px-3 py-2 text-sm font-medium transition",
                        isActive ? "bg-ntr-emerald/20 text-ntr-emerald-bright" : "text-slate-100 hover:bg-white/5",
                      ].join(" ")
                    }
                  >
                    {link.label}
                  </NavLink>
                ) : (
                  <a
                    key={link.id}
                    href={link.href}
                    target={link.newTab ? "_blank" : undefined}
                    rel={link.newTab ? "noreferrer" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/5"
                  >
                    {link.label}
                  </a>
                ),
              )}
            </div>
          </div>
        )}
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>

      <footer className="relative z-10 border-t border-white/5 bg-slate-950/70 px-6 py-6 text-sm text-slate-300">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span>© {new Date().getFullYear()} {brandName}</span>
          <span className="text-slate-400">{footerTagline}</span>
        </div>
      </footer>
    </div>
  );
}

export default Layout;
