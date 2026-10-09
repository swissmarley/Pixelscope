export type ImageMime = "image/png" | "image/jpeg" | "image/webp";
export interface ImageInfo {
  mime: ImageMime;
  /** Stored size, before any EXIF orientation is applied. */
  width: number;
  height: number;
  /** EXIF orientation (1–8) for JPEG; 1 when absent. */
  orientation?: number;
}
/** Largest reference file accepted, before re-encoding. */
export const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
/** Pixel cap checked from the header, before anything is decoded. */
export const MAX_REFERENCE_PIXELS = 40_000_000;
/** Longest side of the re-encoded reference sent to Lab or Live. */
export const REFERENCE_MAX_SIDE = 1536;

const ascii = (b: Uint8Array, at: number, text: string) =>
  [...text].every((c, i) => b[at + i] === c.charCodeAt(0));
const isJpeg = (b: Uint8Array) =>
  b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** Orientation tag (0x0112) from the IFD0 of an APP1 Exif segment, if valid. */
function exifOrientation(
  view: DataView,
  start: number,
  end: number,
): number | undefined {
  const tiff = start + 6; // after "Exif\0\0"
  if (tiff + 8 > end) return undefined;
  const little = view.getUint16(tiff) === 0x4949; // "II"
  const u16 = (at: number) => view.getUint16(at, little);
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > end) return undefined;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return undefined;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : undefined;
    }
  }
  return undefined;
}

/**
 * Identify a PNG, JPEG or WebP file from its bytes, not its name, and read
 * its dimensions from the header. Returns undefined for anything else,
 * including truncated or empty files.
 */
export function sniffImage(bytes: Uint8Array): ImageInfo | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fits = (n: number) => bytes.length >= n;
  if (
    fits(24) &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (v, i) => bytes[i] === v,
    ) &&
    ascii(bytes, 12, "IHDR")
  ) {
    return {
      mime: "image/png",
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  }
  if (fits(4) && isJpeg(bytes)) {
    let at = 2;
    let orientation = 1;
    while (fits(at + 9)) {
      if (bytes[at] !== 0xff) return undefined;
      const marker = bytes[at + 1];
      if (marker === 0xff) {
        at++;
        continue;
      }
      // Start-of-frame markers carry the dimensions; C4, C8 and CC do not.
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      ) {
        return {
          mime: "image/jpeg",
          height: view.getUint16(at + 5),
          width: view.getUint16(at + 7),
          orientation,
        };
      }
      const length = view.getUint16(at + 2);
      // APP1 "Exif" comes before the frame header in valid files.
      if (marker === 0xe1 && ascii(bytes, at + 4, "Exif\0\0"))
        orientation =
          exifOrientation(
            view,
            at + 4,
            Math.min(at + 2 + length, bytes.length),
          ) ?? orientation;
      at += 2 + length;
    }
    return undefined;
  }
  if (fits(30) && ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) {
    if (ascii(bytes, 12, "VP8 "))
      return {
        mime: "image/webp",
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    if (ascii(bytes, 12, "VP8L") && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      return {
        mime: "image/webp",
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    if (ascii(bytes, 12, "VP8X")) {
      const u24 = (at: number) =>
        bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
      return { mime: "image/webp", width: u24(24) + 1, height: u24(27) + 1 };
    }
  }
  return undefined;
}

/** Size as displayed: EXIF orientations 5–8 rotate by 90° and swap sides. */
export function displaySize(info: ImageInfo): {
  width: number;
  height: number;
} {
  return (info.orientation ?? 1) >= 5
    ? { width: info.height, height: info.width }
    : { width: info.width, height: info.height };
}

/**
 * Read the file's header in growing slices until the dimensions are found.
 * Only JPEG can need more than the first slice: metadata segments such as
 * EXIF thumbnails or ICC profiles may push the frame header far back.
 */
export async function readImageInfo(
  file: Blob,
  firstSlice = 64 * 1024,
): Promise<ImageInfo | undefined> {
  for (let size = firstSlice; ; size *= 4) {
    const head = new Uint8Array(await file.slice(0, size).arrayBuffer());
    const info = sniffImage(head);
    if (info || size >= file.size || !isJpeg(head)) return info;
  }
}

/** Explain why a reference cannot be used, or return undefined if it can. */
export function referenceProblem(
  size: number,
  info: ImageInfo | undefined,
): string | undefined {
  if (size > MAX_REFERENCE_BYTES) return "Choose an image smaller than 10 MB.";
  if (!info || !info.width || !info.height)
    return "This file is not a readable PNG, JPEG or WebP image.";
  if (info.width * info.height > MAX_REFERENCE_PIXELS)
    return `This image is ${info.width} × ${info.height}. Choose one under 40 megapixels.`;
  return undefined;
}

const blobToDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * Validate a user-chosen reference and re-encode it through a canvas. This
 * confirms that it decodes, caps its size, and drops EXIF/GPS and other
 * metadata before it is stored or sent anywhere.
 */
export async function prepareReference(file: File): Promise<string> {
  if (file.size > MAX_REFERENCE_BYTES)
    throw new Error("Choose an image smaller than 10 MB.");
  const info = await readImageInfo(file);
  const problem = referenceProblem(file.size, info);
  if (problem || !info) throw new Error(problem);
  // The bitmap is rotated upright first, so size it as displayed.
  const { width, height } = displaySize(info);
  const scale = Math.min(1, REFERENCE_MAX_SIDE / Math.max(width, height));
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
      resizeWidth: Math.max(1, Math.round(width * scale)),
      resizeHeight: Math.max(1, Math.round(height * scale)),
      resizeQuality: "high",
    });
  } catch {
    throw new Error("This image could not be decoded. It may be damaged.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  // JPEG stays JPEG; PNG and WebP become PNG so transparency survives.
  const type = info.mime === "image/jpeg" ? "image/jpeg" : "image/png";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, 0.92),
  );
  if (!blob) throw new Error("This image could not be prepared.");
  if (blob.size > MAX_REFERENCE_BYTES)
    throw new Error("Choose an image smaller than 10 MB.");
  return blobToDataURL(blob);
}

/** File extension for a downloaded image, from its MIME type. */
export function imageExtension(type: string): string {
  const known: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  };
  return known[type.split(";")[0].trim().toLowerCase()] || "png";
}
