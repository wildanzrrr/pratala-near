declare module "piexifjs" {
  interface PiexifGpsHelper {
    degToDmsRational(deg: number): [number, number][];
    dmsRationalToDeg(rational: [number, number][], ref?: string): number;
  }
  interface Piexif {
    dump(exifObj: Record<string, unknown>): string;
    insert(exifStr: string, dataUrl: string): string;
    GPSIFD: { GPSLatitudeRef: number; GPSLatitude: number; GPSLongitudeRef: number; GPSLongitude: number };
    ExifIFD: { DateTimeOriginal: number };
    GPSHelper: PiexifGpsHelper;
  }
  const piexif: Piexif;
  export default piexif;
}
