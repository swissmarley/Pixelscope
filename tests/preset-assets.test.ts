import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { promptPresets } from "../src/core/presets";
describe("bundled preset assets", () => {
  it("ships distinct final images and all 24 readable frames for every preset", () => {
    const hashes = new Set<string>();
    for (const preset of promptPresets) {
      const directory = `public${preset.directory}`;
      expect(existsSync(`${directory}/final.webp`)).toBe(true);
      const final = readFileSync(`${directory}/final.webp`);
      expect(final.subarray(0, 4).toString()).toBe("RIFF");
      expect(final.subarray(8, 12).toString()).toBe("WEBP");
      hashes.add(createHash("sha256").update(final).digest("hex"));
      for (let step = 1; step <= 24; step++)
        expect(
          readFileSync(`${directory}/frame-${step}.webp`)
            .subarray(8, 12)
            .toString(),
        ).toBe("WEBP");
    }
    expect(hashes.size).toBe(promptPresets.length);
  });
});
