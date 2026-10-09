import type { RunConfig } from "./types";
/** Settings that survive a reload. Prompts, references and the mode do not. */
export const persistedKeys = [
  "provider",
  "model",
  "proxyUrl",
  "labUrl",
  "steps",
  "sampler",
  "negative",
  "guidance",
] as const;
export type PersistedSettings = Pick<RunConfig, (typeof persistedKeys)[number]>;
export function pickSettings(c: RunConfig): PersistedSettings {
  return Object.fromEntries(
    persistedKeys.map((k) => [k, c[k]]),
  ) as PersistedSettings;
}
const inRange = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
/** Keep only well-formed stored values, so a stale or edited entry cannot break the app. */
export function sanitizeSettings(value: unknown): Partial<PersistedSettings> {
  if (typeof value !== "object" || value === null) return {};
  const v = value as Record<string, unknown>;
  const out: Partial<PersistedSettings> = {};
  if (v.provider === "openai" || v.provider === "gemini")
    out.provider = v.provider;
  if (typeof v.model === "string" && /^[a-zA-Z0-9._-]{1,100}$/.test(v.model))
    out.model = v.model;
  if (typeof v.proxyUrl === "string" && !serverUrlProblem(v.proxyUrl))
    out.proxyUrl = v.proxyUrl;
  if (typeof v.labUrl === "string" && !serverUrlProblem(v.labUrl))
    out.labUrl = v.labUrl;
  if (inRange(v.steps, 1, 50)) out.steps = Math.round(v.steps as number);
  if (v.sampler === "Euler" || v.sampler === "DDIM") out.sampler = v.sampler;
  if (typeof v.negative === "string" && v.negative.length <= 4000)
    out.negative = v.negative;
  if (inRange(v.guidance, 0, 15)) out.guidance = v.guidance as number;
  return out;
}
/** Explain why a server URL is unusable, or return undefined if it is fine. */
export function serverUrlProblem(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Enter a full URL, such as http://127.0.0.1:8000.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return "Use an http:// or https:// URL.";
  if (url.search || url.hash)
    return "Remove the query or fragment from the URL.";
  return undefined;
}
/** Server base URL without a trailing slash, ready for appending a path. */
export function serverBase(value: string): string {
  return value.trim().replace(/\/+$/, "");
}
/** Optional proxy token: printable ASCII only, so it is a valid header value. */
export function sanitizeProxyToken(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/[^\x20-\x7e]/g, "").slice(0, 200)
    : "";
}
/** Whole-number seed in the 32-bit range. */
export function clampSeed(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(4294967295, Math.trunc(value)));
}
