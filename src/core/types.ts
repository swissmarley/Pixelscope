export type Family = "diffusion" | "autoregressive" | "hosted";
export type Mode = "mock" | "lab" | "live";
export type Stage =
  | "request"
  | "tokens"
  | "embeddings"
  | "noise"
  | "denoise"
  | "attention"
  | "guidance"
  | "decode"
  | "edit"
  | "delivery"
  | "sequence";
export type Provenance = "illustrative" | "observed";
export interface RunConfig {
  prompt: string;
  negative: string;
  seed: number;
  steps: number;
  guidance: number;
  strength: number;
  sampler: "Euler" | "DDIM";
  family: Family;
  mode: Mode;
  reference?: string;
  provider: "openai" | "gemini";
  model: string;
  proxyUrl: string;
  labUrl: string;
}
export interface Token {
  text: string;
  id: number;
}
export interface Candidate {
  id: number;
  probability: number;
  color: string;
}
export interface Metadata {
  seed?: number;
  steps?: number;
  guidance?: number;
  model: string;
  size: string;
  seconds: number;
}
interface Base {
  id: string;
  stage: Stage;
  duration: number;
  elapsed: number;
  provenance: Provenance;
}
export type EventData =
  | { type: "request_built"; request: Record<string, unknown> }
  | { type: "sent"; model: string }
  | { type: "prompt_tokenized"; tokens: Token[]; limit: number; total: number }
  | { type: "text_embedded"; vectors: number[][]; projection: number[][] }
  | {
      type: "noise_initialized";
      seed: number;
      shape: number[];
      preview?: string;
    }
  | {
      type: "denoise_step";
      step: number;
      total: number;
      timestep: number;
      sigma: number;
      preview: string;
      attention: Record<string, number[]>;
      guidance: {
        scale: number;
        unconditional?: string;
        conditional?: string;
        difference?: string;
      };
      prediction?: number[];
      noisePrediction?: string;
    }
  | { type: "vae_decoded"; image: string }
  | {
      type: "reference_encoded";
      image: string;
      strength: number;
      preview?: string;
    }
  | { type: "image_tokens_planned"; rows: number; cols: number }
  | {
      type: "image_token_sampled";
      position: number;
      tokenId: number;
      candidates: Candidate[];
    }
  | { type: "grid_progress"; filled: number; total: number; preview: string }
  | { type: "image_decoded"; image: string }
  | { type: "partial_image"; image: string; index: number }
  | { type: "final_image"; image: string }
  | { type: "usage"; usage: Record<string, unknown> }
  | { type: "done"; metadata: Metadata };
export type PipelineEvent = Base & EventData;
export interface PipelineSource {
  stream(config: RunConfig, signal: AbortSignal): AsyncIterable<PipelineEvent>;
}
export interface SavedRun {
  id: string;
  created: number;
  config: RunConfig;
  events: PipelineEvent[];
  thumbnail: string;
}
export const defaultConfig: RunConfig = {
  prompt:
    "A cozy cabin beside an alpine lake at sunset, cinematic light, reflections on still water",
  negative: "",
  seed: 42819,
  steps: 24,
  guidance: 7.5,
  strength: 0.55,
  sampler: "Euler",
  family: "diffusion",
  mode: "mock",
  provider: "openai",
  model: "gpt-image-1",
  proxyUrl: "http://127.0.0.1:3001",
  labUrl: "http://127.0.0.1:8000",
};
export const stages: { id: Stage; title: string; short: string }[] = [
  { id: "request", title: "Compose & send", short: "Request" },
  { id: "tokens", title: "Words into tokens", short: "Tokens" },
  { id: "embeddings", title: "A map of meaning", short: "Embeddings" },
  { id: "noise", title: "It starts with noise", short: "Noise" },
  { id: "denoise", title: "Order from randomness", short: "Denoising" },
  { id: "attention", title: "Text steers the image", short: "Attention" },
  { id: "guidance", title: "The pull of the prompt", short: "Guidance" },
  { id: "decode", title: "From latent to light", short: "Decode" },
  { id: "edit", title: "A new direction", short: "Editing" },
  { id: "sequence", title: "One token at a time", short: "Image tokens" },
  { id: "delivery", title: "Your idea, in pixels", short: "Delivery" },
];
export function familyStages(c: RunConfig) {
  const order: Stage[] =
    c.family === "hosted"
      ? ["request", "delivery"]
      : c.family === "autoregressive"
        ? ["request", "tokens", "sequence", "decode", "delivery"]
        : [
            "request",
            "tokens",
            "embeddings",
            ...(c.reference ? ["edit" as const] : []),
            "noise",
            "denoise",
            "attention",
            "guidance",
            "decode",
            "delivery",
          ];
  return order.map((id) => stages.find((s) => s.id === id)!);
}
