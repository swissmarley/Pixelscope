import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const input = process.argv[2];
const directory = process.argv[3] || "public/demo";
await mkdir(directory, { recursive: true });
if (!input) throw Error("Pass the demo source image path.");
await sharp(input)
  .resize(512, 512)
  .webp({ quality: 90 })
  .toFile(path.join(directory, "final.webp"));
const { data } = await sharp(input)
  .resize(512, 512)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
let seed = 42819;
const rand = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const noise = Float32Array.from(
  { length: 512 * 512 },
  () =>
    Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-8))) *
    Math.cos(2 * Math.PI * rand()),
);
for (let step = 1; step <= 24; step++) {
  const progress = step / 24;
  const size = Math.round(16 + 496 * progress ** 1.5);
  const blurred = await sharp(data, {
    raw: { width: 512, height: 512, channels: 3 },
  })
    .resize(size, size)
    .resize(512, 512)
    .raw()
    .toBuffer();
  const pixels = Buffer.alloc(data.length);
  const amplitude = 100 * (1 - progress) ** 2;
  for (let i = 0; i < pixels.length; i++)
    pixels[i] = Math.max(
      0,
      Math.min(
        255,
        blurred[i] * progress +
          128 * (1 - progress) +
          noise[Math.floor(i / 3)] * amplitude,
      ),
    );
  await sharp(pixels, { raw: { width: 512, height: 512, channels: 3 } })
    .webp({ quality: 85 })
    .toFile(path.join(directory, `frame-${step}.webp`));
}
