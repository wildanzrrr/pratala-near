"use client";

import { useRef, useState } from "react";

import { Camera, CheckCircle, MapPin, Plus, Trash, WarningCircle } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { shortHash } from "@/lib/near/format";
import { cn, sha256Hex } from "@/lib/utils";
import { useT } from "@/providers/locale-provider";

import type { Dispatch, SetStateAction } from "react";
import type { Evidence, EvidenceKind } from "@/lib/near/types";

export interface GeoPoint {
  lat: number;
  lng: number;
  source: "photo" | "device";
}

export interface EvidenceItem {
  localId: string;
  previewUrl: string;
  fileName: string;
  sha256: string | null;
  gps: GeoPoint | null;
  evidence: Evidence | null;
  status: "reading" | "uploading" | "ready" | "error";
  error?: string;
}

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Camera-first evidence capture. Opens the rear camera on phones
 * (capture="environment"), reads EXIF GPS, falls back to the phone's location,
 * computes the sha256 fingerprint locally, then uploads to the Pratala API
 * (Google Cloud Storage). Upload is required: a photo that is not uploaded
 * is an error and cannot be used as evidence.
 */
export function EvidenceUploader({
  items,
  onItemsChange,
  kind,
  lotId,
  max = 4,
  canUpload,
  label,
}: {
  items: EvidenceItem[];
  onItemsChange: Dispatch<SetStateAction<EvidenceItem[]>>;
  kind: EvidenceKind;
  lotId?: string;
  max?: number;
  /** false when the API is offline or the user isn't signed in to it */
  canUpload: boolean;
  label?: string;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const patch = (localId: string, next: Partial<EvidenceItem>) =>
    onItemsChange((list) => list.map((item) => (item.localId === localId ? { ...item, ...next } : item)));

  async function addFile(file: File) {
    const localId = crypto.randomUUID();
    if (!file.type.startsWith("image/")) {
      onItemsChange((l) => [...l, { localId, previewUrl: "", fileName: file.name, sha256: null, gps: null, evidence: null, status: "error", error: t("evidence.notImage") }]);
      return;
    }
    if (file.size > MAX_BYTES) {
      onItemsChange((l) => [...l, { localId, previewUrl: "", fileName: file.name, sha256: null, gps: null, evidence: null, status: "error", error: t("evidence.tooBig") }]);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    onItemsChange((l) => [...l, { localId, previewUrl, fileName: file.name, sha256: null, gps: null, evidence: null, status: "reading" }]);

    const [sha256, gps] = await Promise.all([
      file.arrayBuffer().then(sha256Hex),
      import("exifr")
        .then((m) => m.gps(file))
        .then((g) => (g && Number.isFinite(g.latitude) ? ({ lat: g.latitude, lng: g.longitude, source: "photo" } as GeoPoint) : null))
        .catch(() => null),
    ]);
    if (!canUpload) {
      patch(localId, { sha256, gps, status: "error", error: t("evidence.signInToUpload") });
      return;
    }
    patch(localId, { sha256, gps, status: "uploading" });
    try {
      const evidence = await api.uploadEvidence(file, kind, { lotId });
      patch(localId, {
        evidence,
        sha256: evidence.sha256 || sha256,
        gps: gps ?? (evidence.lat !== null && evidence.lng !== null ? { lat: evidence.lat, lng: evidence.lng, source: "photo" } : null),
        status: "ready",
      });
    } catch {
      patch(localId, { status: "error", error: t("evidence.uploadFailed") });
    }
  }

  function requestDeviceLocation(localId?: string) {
    if (!("geolocation" in navigator)) {
      setGeoError(t("evidence.gpsDenied"));
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const point: GeoPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude, source: "device" };
        onItemsChange((list) => list.map((item) => (!localId || item.localId === localId) && !item.gps ? { ...item, gps: point } : item));
      },
      () => {
        setLocating(false);
        setGeoError(t("evidence.gpsDenied"));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  function remove(localId: string) {
    onItemsChange((list) => {
      const item = list.find((i) => i.localId === localId);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return list.filter((i) => i.localId !== localId);
    });
  }

  const missingGps = items.some((i) => i.sha256 && !i.gps);
  const full = items.length >= max;

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={max > 1}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).slice(0, Math.max(0, max - items.length));
          files.forEach((f) => void addFile(f));
          e.target.value = "";
        }}
      />

      {items.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          {items.map((item) => (
            <li key={item.localId} className="flex gap-3 rounded-md border border-border bg-card p-2">
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                <img src={item.previewUrl} alt="" className="size-20 shrink-0 rounded-sm object-cover" />
              ) : (
                <span className="grid size-20 shrink-0 place-items-center rounded-sm bg-sunken">
                  <WarningCircle aria-hidden className="size-6 text-destructive" />
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
                <ItemStatus item={item} />
                {item.sha256 ? (
                  <span className="truncate font-mono text-muted-foreground" title={item.sha256}>
                    {t("evidence.hash")}: {shortHash(item.sha256, 8, 6)}
                  </span>
                ) : null}
                {item.gps ? (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <MapPin aria-hidden className="size-3.5 shrink-0" />
                    <span className="tnum truncate">
                      {item.gps.lat.toFixed(5)}, {item.gps.lng.toFixed(5)} ·{" "}
                      {item.gps.source === "photo" ? t("evidence.gpsFromPhoto") : t("evidence.gpsFromDevice")}
                    </span>
                  </span>
                ) : item.sha256 ? (
                  <span className="text-attention-foreground">{t("evidence.gpsMissing")}</span>
                ) : null}
                {item.error && item.status !== "error" ? <span className="text-muted-foreground">{item.error}</span> : null}
                <button
                  type="button"
                  onClick={() => remove(item.localId)}
                  className="mt-auto inline-flex w-fit items-center gap-1 py-1 text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
                >
                  <Trash aria-hidden className="size-3.5" />
                  {t("evidence.remove")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!full ? (
          <Button type="button" variant={items.length ? "outline" : "default"} size={items.length ? "default" : "lg"} onClick={() => inputRef.current?.click()}>
            {items.length ? <Plus data-icon="inline-start" /> : <Camera data-icon="inline-start" />}
            {label ?? (items.length ? t("evidence.add") : t("evidence.take"))}
          </Button>
        ) : null}
        {missingGps ? (
          <Button type="button" variant="outline" onClick={() => requestDeviceLocation()} disabled={locating}>
            {locating ? <Spinner data-icon="inline-start" /> : <MapPin data-icon="inline-start" />}
            {locating ? t("evidence.locating") : t("evidence.useDevice")}
          </Button>
        ) : null}
      </div>
      {geoError ? <p className="text-sm text-destructive">{geoError}</p> : null}
    </div>
  );
}

function ItemStatus({ item }: { item: EvidenceItem }) {
  const t = useT();
  const map = {
    reading: { icon: <Spinner />, text: t("evidence.reading"), cls: "text-muted-foreground" },
    uploading: { icon: <Spinner />, text: t("evidence.uploading"), cls: "text-muted-foreground" },
    ready: { icon: <CheckCircle aria-hidden weight="fill" className="size-3.5 text-primary" />, text: t("evidence.uploaded"), cls: "text-foreground" },
    error: { icon: <WarningCircle aria-hidden className="size-3.5" />, text: item.error ?? "", cls: "text-destructive" },
  }[item.status];
  return (
    <span className={cn("flex items-center gap-1.5 font-medium", map.cls)} aria-live="polite">
      {map.icon}
      {map.text}
    </span>
  );
}

/** Derive the on-chain hashes a lot or attestation needs from captured evidence. */
export async function evidenceDigest(items: EvidenceItem[]) {
  const hashes = items.map((i) => i.sha256).filter((h): h is string => Boolean(h));
  const gps = items.find((i) => i.gps)?.gps ?? null;
  const evidenceHash = hashes.length === 1 ? hashes[0] : await sha256Hex(hashes.join(","));
  const gpsHash = gps ? await sha256Hex(`${gps.lat.toFixed(5)},${gps.lng.toFixed(5)}`) : null;
  const first = items.find((i) => i.evidence);
  return { evidenceHash, gpsHash, gps, evidenceUri: first?.evidence?.uri ?? null, evidenceId: first?.evidence?.id ?? null };
}
