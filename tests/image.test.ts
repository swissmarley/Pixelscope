import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  imageExtension,
  referenceProblem,
  sniffImage,
  MAX_REFERENCE_BYTES,
} from "../src/core/image";
const solid = (width: number, height: number, channels: 3 | 4 = 3) =>
  sharp({
    create: { width, height, channels, background: "#4060a0" },
  });
describe("reference image checks", () => {
  it("reads type and size from PNG, JPEG and every WebP variant", async () => {
    const cases = [
      [await solid(640, 480).png().toBuffer(), "image/png"],
      [await solid(640, 480).jpeg().toBuffer(), "image/jpeg"],
      [await solid(640, 480).webp().toBuffer(), "image/webp"],
      [await solid(640, 480).webp({ lossless: true }).toBuffer(), "image/webp"],
      [await solid(640, 480, 4).webp().toBuffer(), "image/webp"],
    ] as const;
    for (const [bytes, mime] of cases)
      expect(sniffImage(new Uint8Array(bytes))).toEqual({
        mime,
        width: 640,
        height: 480,
      });
  });
  it("finds JPEG dimensions after EXIF metadata", async () => {
    const bytes = await solid(300, 200)
      .withMetadata({ exif: { IFD0: { Artist: "x".repeat(5000) } } })
      .jpeg()
      .toBuffer();
    expect(sniffImage(new Uint8Array(bytes))).toMatchObject({
      width: 300,
      height: 200,
    });
  });
  it("rejects renamed, empty and truncated files", async () => {
    const text = new TextEncoder().encode("just some text, not an image");
    const svg = new TextEncoder().encode(
      "<svg xmlns='http://www.w3.org/2000/svg'/>",
    );
    const jpeg = await solid(64, 64).jpeg().toBuffer();
    for (const bytes of [text, svg, new Uint8Array(), jpeg.subarray(0, 4)])
      expect(sniffImage(new Uint8Array(bytes))).toBeUndefined();
    expect(referenceProblem(10, undefined)).toMatch(/not a readable/);
  });
  it("caps bytes and pixels before anything is decoded", () => {
    const info = { mime: "image/png" as const, width: 16000, height: 16000 };
    expect(referenceProblem(500_000, info)).toMatch(/16000 × 16000/);
    expect(referenceProblem(MAX_REFERENCE_BYTES + 1, info)).toMatch(/10 MB/);
    expect(
      referenceProblem(500_000, { ...info, width: 640, height: 480 }),
    ).toBeUndefined();
  });
  it("names downloads after the actual image type", () => {
    expect(imageExtension("image/jpeg")).toBe("jpg");
    expect(imageExtension("image/webp")).toBe("webp");
    expect(imageExtension("image/png")).toBe("png");
  });
});
