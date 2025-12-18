import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMediaList } from "../lib/api";

export type MediaItem = {
  name: string;
  url: string;
  contentType?: string;
  size?: number;
  lastModified?: string;
};

export function MediaPicker({
  open,
  title,
  onClose,
  onSelect,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSelect: (url: string) => void;
}) {
  const [query, setQuery] = useState("");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["media", "list"],
    queryFn: () => fetchMediaList({ limit: 200 }),
    enabled: open,
  });

  const items = useMemo(() => {
    const list = data?.items || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) => item.name.toLowerCase().includes(q));
  }, [data, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-5xl rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-100">{title}</div>
            <div className="text-xs text-slate-400">Select an image stored in Azure Blob Storage.</div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => refetch()}>
              Refresh
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <input
            className="input-field w-full"
            placeholder="Filter by filename"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="mt-4 text-sm text-slate-200">Loading media...</div>
        ) : isError ? (
          <div className="mt-4 text-sm text-red-200">Failed to load media.</div>
        ) : items.length ? (
          <div className="mt-4 grid max-h-[60vh] grid-cols-2 gap-3 overflow-auto md:grid-cols-4">
            {items.map((item) => (
              <button
                key={item.name}
                type="button"
                className="group flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-2 text-left transition hover:border-emerald-300/40"
                onClick={() => onSelect(item.url)}
              >
                <img
                  src={item.url}
                  alt={item.name}
                  className="h-32 w-full rounded-lg bg-black/30 object-cover"
                  loading="lazy"
                />
                <div className="text-xs text-slate-200 break-all group-hover:text-emerald-100">{item.name}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-4 text-sm text-slate-400">No media found.</div>
        )}
      </div>
    </div>
  );
}
