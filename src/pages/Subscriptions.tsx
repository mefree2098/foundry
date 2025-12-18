import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import SectionCard from "../components/SectionCard";
import { fetchPlatforms, subscribe, unsubscribe } from "../lib/api";

function Subscriptions() {
  const { data: platforms = [] } = useQuery({ queryKey: ["platforms"], queryFn: fetchPlatforms });
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"all" | "custom">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const saveMutation = useMutation({
    mutationFn: subscribe,
    onSuccess: () => {
      setStatus({ type: "success", message: "Preferences saved." });
    },
    onError: (err: unknown) => {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Could not save preferences." });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: () => unsubscribe(email),
    onSuccess: () => {
      setStatus({ type: "success", message: "You have been unsubscribed." });
    },
    onError: (err: unknown) => {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Could not unsubscribe." });
    },
  });

  const togglePlatform = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;
    saveMutation.mutate({
      email,
      subscribeAll: mode === "all",
      platformIds: mode === "custom" ? selected : [],
    });
  };

  return (
    <div className="space-y-6">
      <SectionCard title="Manage subscriptions">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-ntr-magenta"
              placeholder="you@example.com"
            />
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={mode === "all"} onChange={() => setMode("all")} />
                All platforms
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} />
                Pick platforms
              </label>
            </div>
          </div>

          {mode === "custom" && (
            <div className="flex flex-wrap gap-2">
              {platforms.length === 0 && <span className="text-xs text-slate-400">Platforms coming soon.</span>}
              {platforms.map((platform) => (
                <button
                  key={platform.id}
                  type="button"
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

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="rounded-md bg-ntr-magenta px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-ntr-magenta/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saveMutation.isPending ? "Saving..." : "Save preferences"}
            </button>
            <button
              type="button"
              disabled={unsubscribeMutation.isPending || !email}
              onClick={() => unsubscribeMutation.mutate()}
              className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-red-300/70 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {unsubscribeMutation.isPending ? "Unsubscribing..." : "Unsubscribe"}
            </button>
          </div>
        </form>

        {status && (
          <p className={`mt-3 text-sm ${status.type === "success" ? "text-ntr-emerald-bright" : "text-red-300"}`}>{status.message}</p>
        )}
        <p className="mt-2 text-xs text-slate-400">
          Every email we send includes a direct unsubscribe link. Use this page any time to change your preferences.
        </p>
      </SectionCard>
    </div>
  );
}

export default Subscriptions;
