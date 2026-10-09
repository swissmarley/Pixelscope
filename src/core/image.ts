export type ImageMime = "image/png" | "image/jpeg" | "image/webp";
export interface ImageInfo {
  mime: ImageMime;
  width: number;
  height: number;
}
/** Largest reference file accepted, before re-encoding. */
export const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
/** Pixel cap checked from the header, before anything is decoded. */
export const MAX_REFERENCE_PIXELS = 40_000_000;
/** Longest side of the re-encoded reference sent to Lab or Live. */
export const REFERENCE_MAX_SIDE = 1536;

const ascii = (b: Uint8Array, at: number, text: string) =>
  [...text].every((c, i) => b[at + i] === c.charCodeAt(0));

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
  if (fits(4) && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    let at = 2;
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
        };
      }
      at += 2 + view.getUint16(at + 2);
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
  const head = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
  const info = sniffImage(head);
  const problem = referenceProblem(file.size, info);
  if (problem || !info) throw new Error(problem);
  const scale = Math.min(
    1,
    REFERENCE_MAX_SIDE / Math.max(info.width, info.height),
  );
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, {
      resizeWidth: Math.max(1, Math.round(info.width * scale)),
      resizeHeight: Math.max(1, Math.round(info.height * scale)),
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
