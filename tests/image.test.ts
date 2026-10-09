import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  displaySize,
  imageExtension,
  readImageInfo,
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
      expect(sniffImage(new Uint8Array(bytes))).toMatchObject({
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
  it("reads EXIF orientation and swaps sides for rotated photos", async () => {
    const bytes = await solid(640, 480)
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const info = sniffImage(new Uint8Array(bytes));
    expect(info).toEqual({
      mime: "image/jpeg",
      width: 640,
      height: 480,
      orientation: 6,
    });
    expect(displaySize(info!)).toEqual({ width: 480, height: 640 });
    const upright = sniffImage(
      new Uint8Array(await solid(640, 480).jpeg().toBuffer()),
    );
    expect(upright?.orientation).toBe(1);
    expect(displaySize(upright!)).toEqual({ width: 640, height: 480 });
  });
  it("keeps reading slices until the JPEG frame header", async () => {
    const bytes = await solid(300, 200)
      .withMetadata({ exif: { IFD0: { Artist: "x".repeat(20000) } } })
      .jpeg()
      .toBuffer();
    // The frame header lies beyond a 1 KB first slice.
    expect(sniffImage(new Uint8Array(bytes.subarray(0, 1024)))).toBeUndefined();
    expect(
      await readImageInfo(new Blob([new Uint8Array(bytes)]), 1024),
    ).toMatchObject({ width: 300, height: 200 });
    const text = new Blob(["not an image ".repeat(1000)]);
    expect(await readImageInfo(text, 1024)).toBeUndefined();
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
