import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteBusinessCustomer, fetchBusinessCustomers, saveBusinessCustomer } from "../lib/api";
import type { BusinessCustomerInput } from "../lib/businessSchemas";

export function useBusinessCustomers() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["business", "customers"],
    queryFn: fetchBusinessCustomers,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: BusinessCustomerInput) => saveBusinessCustomer(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "customers"] });
      await queryClient.invalidateQueries({ queryKey: ["business", "audit"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBusinessCustomer(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "customers"] });
      await queryClient.invalidateQueries({ queryKey: ["business", "audit"] });
    },
  });

  return {
    ...query,
    saveCustomer: saveMutation.mutateAsync,
    removeCustomer: deleteMutation.mutateAsync,
    saveStatus: saveMutation.status,
    deleteStatus: deleteMutation.status,
  };
}
