import { useQuery } from "@tanstack/react-query";
import { fetchBusinessAudit } from "../lib/api";

export function useBusinessAudit(limit = 25) {
  return useQuery({
    queryKey: ["business", "audit", { limit }],
    queryFn: () => fetchBusinessAudit({ limit }),
  });
}
