import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { fetchPlatforms, subscribe } from "../lib/api";

function NewsletterCTA() {
  const { data: platforms = [] } = useQuery({ queryKey: ["platforms"], queryFn: fetchPlatforms });
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"all" | "custom">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: subscribe,
    onSuccess: () => {
      setMessage("You're in! We'll send platform updates and company news.");
      setError(null);
      setEmail("");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Could not save your subscription.";
      setError(msg);
      setMessage(null);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;
    const payload = {
      email,
      subscribeAll: mode === "all",
      platformIds: mode === "custom" ? selected : [],
    };
    mutation.mutate(payload);
  };

  const togglePlatform = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="glass-surface mt-6 rounded-3xl p-6">
      <h3 className="text-xl font-semibold text-slate-50">Stay in the loop</h3>
      <p className="mt-2 text-sm text-slate-200">
        Subscribe for product platform updates and company news. Pick all platforms or only the ones you care about.
      </p>
      <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            required
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-ntr-magenta"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-xl bg-ntr-magenta px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-ntr-magenta/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {mutation.isPending ? "Saving..." : "Subscribe"}
          </button>
        </div>

        <div className="flex flex-wrap gap-3 text-sm text-slate-200">
          <label className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">
            <input type="radio" checked={mode === "all"} onChange={() => setMode("all")} />
            All platforms
          </label>
          <label className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">
            <input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} />
            Pick platforms
          </label>
        </div>

        {mode === "custom" && (
          <div className="flex flex-wrap gap-2">
            {platforms.length === 0 && <span className="text-xs text-slate-400">Platforms coming soon.</span>}
            {platforms.map((platform) => (
              <button
                type="button"
                key={platform.id}
                onClick={() => togglePlatform(platform.id)}
                className={[
                  "rounded-full border px-3 py-1 text-xs transition",
                  selected.includes(platform.id)
                    ? "border-ntr-emerald-bright/60 bg-ntr-emerald/20 text-ntr-emerald-bright"
                    : "border-white/10 text-slate-200 hover:border-white/30",
                ].join(" ")}
              >
                {platform.name || platform.id}
              </button>
            ))}
          </div>
        )}
      </form>

      {message && <p className="mt-3 text-sm text-ntr-emerald-bright">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      <p className="mt-2 text-xs text-slate-400">
        Every email includes a one-click unsubscribe link. You can also manage preferences from the Subscribe page.
      </p>
    </div>
  );
}

export default NewsletterCTA;
