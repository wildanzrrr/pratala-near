import { createHash } from 'node:crypto';
import exifr from 'exifr';

export const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Sniff the real image type from magic bytes (client mime is not trusted). */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
    if (brand === 'avif') return 'image/avif';
  }
  return null;
}

export interface ExifInfo {
  lat: number | null;
  lng: number | null;
  capturedAt: Date | null;
}

/** GPS + DateTimeOriginal via exifr. Missing / unreadable EXIF yields nulls. */
export async function readExif(buf: Buffer): Promise<ExifInfo> {
  try {
    const out = (await exifr.parse(buf, {
      gps: true,
      exif: true,
      tiff: true,
      pick: ['latitude', 'longitude', 'DateTimeOriginal', 'CreateDate', 'GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef'],
    })) as Record<string, unknown> | undefined;
    if (!out) return { lat: null, lng: null, capturedAt: null };
    const lat = typeof out.latitude === 'number' && Number.isFinite(out.latitude) ? out.latitude : null;
    const lng = typeof out.longitude === 'number' && Number.isFinite(out.longitude) ? out.longitude : null;
    const raw = out.DateTimeOriginal ?? out.CreateDate;
    const capturedAt = raw instanceof Date && !Number.isNaN(raw.getTime()) ? raw : null;
    return { lat, lng, capturedAt };
  } catch {
    return { lat: null, lng: null, capturedAt: null };
  }
}
