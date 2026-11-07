export { cn } from "cn";

/** sha256 hex of bytes or text (Web Crypto). */
export async function sha256Hex(input: ArrayBuffer | Uint8Array | string): Promise<string> {
  const data =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function isNearAccountId(value: string): boolean {
  const v = value.trim();
  if (/^[0-9a-f]{64}$/.test(v)) return true;
  if (/^0x[0-9a-f]{40}$/.test(v)) return true;
  return v.length >= 2 && v.length <= 64 && /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(v);
}
