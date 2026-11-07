import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export const listingKeys = {
  all: ["listings"] as const,
  list: (filters: Record<string, string>) => ["listings", "list", filters] as const,
};

export function useListings(filters: Record<string, string> = {}) {
  return useQuery({
    queryKey: listingKeys.list(filters),
    queryFn: () => api.listings(filters),
    retry: false,
  });
}
