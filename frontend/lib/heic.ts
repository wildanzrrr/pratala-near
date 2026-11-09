/**
 * HEIC evidence handling. iPhones capture HEIC by default and Chrome/Firefox
 * cannot decode it (only Safari can), so a raw HEIC blob preview renders blank
 * and the stored photo would be unviewable outside Safari. Before upload we
 * convert HEIC → JPEG and re-inject the photo's GPS + capture-time EXIF, so the
 * evidence bytes keep their embedded location proof for the backend and the AI
 * check to read back. The decoders are dynamically imported and only load when
 * a HEIC file actually shows up.
 */

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "mif1", "msf1"]);

export interface PhotoExif {
  lat: number | null;
  lng: number | null;
  capturedAt: Date | null;
}

/** Magic-byte sniff mirroring the backend's sniffImageMime; file.type is "" for HEIC on some browsers. */
export async function isHeicFile(file: File): Promise<boolean> {
  if (file.type === "image/heic" || file.type === "image/heif") return true;
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const tag = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  return tag(4, 8) === "ftyp" && HEIC_BRANDS.has(tag(8, 12));
}

/** GPS + DateTimeOriginal from the original file (same exifr options as the backend). */
export async function readPhotoExif(file: File): Promise<PhotoExif> {
  try {
    const exifr = await import("exifr");
    const out = (await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      pick: ["latitude", "longitude", "DateTimeOriginal", "CreateDate"],
    })) as Record<string, unknown> | undefined;
    if (!out) return { lat: null, lng: null, capturedAt: null };
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const raw = out.DateTimeOriginal ?? out.CreateDate;
    return {
      lat: num(out.latitude),
      lng: num(out.longitude),
      capturedAt: raw instanceof Date && !Number.isNaN(raw.getTime()) ? raw : null,
    };
  } catch {
    return { lat: null, lng: null, capturedAt: null };
  }
}

/** HEIC → JPEG with the original's GPS + capture time re-embedded as EXIF. Throws when decoding fails. */
export async function heicToJpeg(file: File, exif: PhotoExif): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const jpeg = Array.isArray(converted) ? converted[0] : converted;
  if (!jpeg || jpeg.type !== "image/jpeg") throw new Error("HEIC conversion produced no JPEG");
  const blob =
    exif.lat !== null && exif.lng !== null ? await embedGpsExif(jpeg, exif.lat, exif.lng, exif.capturedAt) : jpeg;
  return new File([blob], `${file.name.replace(/\.hei[cf]$/i, "")}.jpg`, { type: "image/jpeg" });
}

async function embedGpsExif(jpeg: Blob, lat: number, lng: number, capturedAt: Date | null): Promise<Blob> {
  const piexif = (await import("piexifjs")).default;
  const gps: Record<number, unknown> = {
    [piexif.GPSIFD.GPSLatitudeRef]: lat >= 0 ? "N" : "S",
    [piexif.GPSIFD.GPSLatitude]: piexif.GPSHelper.degToDmsRational(Math.abs(lat)),
    [piexif.GPSIFD.GPSLongitudeRef]: lng >= 0 ? "E" : "W",
    [piexif.GPSIFD.GPSLongitude]: piexif.GPSHelper.degToDmsRational(Math.abs(lng)),
  };
  const exifIfd: Record<number, unknown> = {};
  if (capturedAt) exifIfd[piexif.ExifIFD.DateTimeOriginal] = exifTimestamp(capturedAt);
  const dataUrl = piexif.insert(
    piexif.dump({ "0th": {}, Exif: exifIfd, GPS: gps, "1st": {}, thumbnail: null }),
    await blobToDataUrl(jpeg),
  );
  return (await fetch(dataUrl)).blob();
}

/** EXIF format "YYYY:MM:DD HH:MM:SS" in the photo's local time. */
function exifTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}
