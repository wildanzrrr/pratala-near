import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export type PaymentFilters = { account?: string; lotId?: string; from?: string; to?: string };

export const paymentKeys = {
  all: ["payments"] as const,
  list: (filters: PaymentFilters) => ["payments", "list", filters] as const,
};

export function usePayments(filters: PaymentFilters, enabled = true) {
  return useQuery({
    queryKey: paymentKeys.list(filters),
    queryFn: () => api.payments(filters),
    enabled,
    retry: false,
  });
}
