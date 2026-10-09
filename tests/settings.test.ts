import { describe, it, expect } from "vitest";
import {
  clampSeed,
  sanitizeProxyToken,
  pickSettings,
  sanitizeSettings,
  serverUrlProblem,
} from "../src/core/settings";
import { defaultConfig } from "../src/core/types";
describe("settings", () => {
  it("stores connection settings but not prompts, references or mode", () => {
    const saved = pickSettings({
      ...defaultConfig,
      reference: "data:image/png;base64,AAAA",
      mode: "lab",
    });
    expect(saved).not.toHaveProperty("prompt");
    expect(saved).not.toHaveProperty("reference");
    expect(saved).not.toHaveProperty("mode");
    expect(sanitizeSettings(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });
  it("drops malformed stored values", () => {
    expect(
      sanitizeSettings({
        provider: "other",
        model: "../../v1/files",
        proxyUrl: "not a url",
        labUrl: "javascript:alert(1)",
        steps: 500,
        sampler: "PLMS",
        guidance: "7",
        negative: 3,
      }),
    ).toEqual({});
    expect(sanitizeSettings(null)).toEqual({});
  });
  it("explains invalid server URLs", () => {
    expect(serverUrlProblem("http://127.0.0.1:3001")).toBeUndefined();
    expect(serverUrlProblem("not a url")).toMatch(/full URL/);
    expect(serverUrlProblem("ftp://127.0.0.1")).toMatch(/http/);
  });
  it("keeps proxy tokens header-safe", () => {
    expect(sanitizeProxyToken("abc-123")).toBe("abc-123");
    expect(sanitizeProxyToken("ab\ncdé")).toBe("abcd");
    expect(sanitizeProxyToken(42)).toBe("");
  });
  it("keeps seeds whole and in range", () => {
    expect(clampSeed(1.5)).toBe(1);
    expect(clampSeed(1e3)).toBe(1000);
    expect(clampSeed(-5)).toBe(0);
    expect(clampSeed(99999999999)).toBe(4294967295);
    expect(clampSeed(Number.NaN)).toBe(0);
  });
});
