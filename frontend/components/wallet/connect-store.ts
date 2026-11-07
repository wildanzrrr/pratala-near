"use client";

import { useSyncExternalStore } from "react";

/** Tiny global store so any "Masuk" button can open the one connect sheet. */
let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openConnectSheet() {
  open = true;
  emit();
}

export function setConnectSheetOpen(next: boolean) {
  open = next;
  emit();
}

export function useConnectSheetOpen() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
    () => false,
  );
}
