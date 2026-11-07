"use client";

import { useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { isApiUnavailable } from "@/lib/api";
import { ContractNotDeployedError } from "@/lib/near/errors";

import type { ReactNode } from "react";

/** Don't hammer an undeployed contract or an offline API; retry real network blips once. */
function shouldRetry(failureCount: number, error: unknown) {
  if (error instanceof ContractNotDeployedError || isApiUnavailable(error)) return false;
  return failureCount < 1;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            gcTime: 5 * 60_000,
            retry: shouldRetry,
            refetchOnWindowFocus: true,
          },
          mutations: { retry: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
