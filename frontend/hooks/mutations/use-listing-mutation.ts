"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { listingKeys } from "@/hooks/queries/use-listings";
import { useT } from "@/providers/locale-provider";

import type { InputListing, ListingInput } from "@/lib/near/types";

export function useListingMutation() {
  const queryClient = useQueryClient();
  const t = useT();
  return useMutation<InputListing, Error, { id?: string; body: ListingInput }>({
    mutationFn: ({ id, body }) => (id ? api.updateListing(id, body) : api.createListing(body)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: listingKeys.all });
      toast.success(t("supplier.saved"));
    },
    onError: (e) => toast.error(e.message),
  });
}
