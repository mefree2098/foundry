import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchBusinessConfig, saveBusinessConfig } from "../lib/api";
import type { BusinessConfig } from "../lib/businessSchemas";

export function useBusinessConfig() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["business", "config"],
    queryFn: fetchBusinessConfig,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<BusinessConfig>) => saveBusinessConfig(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "config"] });
    },
  });

  return {
    ...query,
    saveConfig: saveMutation.mutateAsync,
    saveConfigStatus: saveMutation.status,
    saveConfigError: saveMutation.error,
  };
}
