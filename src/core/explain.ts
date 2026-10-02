import type { Stage } from "./types";
export const explanation: Record<
  Stage,
  { short: string; deep: string; equation: string }
> = {
  request: {
    short:
      "Your idea becomes a structured request: a prompt, a seed, and the settings that shape a run.",
    deep: "The seed initializes a pseudorandom generator. In the same model and environment, it helps reproduce the starting noise. A hosted provider may not expose a seed.",
    equation: "r = \\{p, s, T, w\\}",
  },
  tokens: {
    short:
      "The model reads tokens, not whole sentences. Words can split into smaller pieces, each with its own vocabulary ID.",
    deep: "The demo uses a simplified tokenizer and made-up vocabulary IDs. The local SD-Turbo track uses real CLIP token IDs and a 77-token context, including special tokens and padding.",
    equation: "p \\rightarrow [t_1, t_2, \\ldots, t_n]",
  },
  embeddings: {
    short:
      "Each token becomes a vector. Together, these vectors give the generator a map of what your words mean.",
    deep: "Rows correspond to tokens; columns are learned dimensions. The demo scatter is illustrative. Lab projects the actual text-encoder vectors to two principal components; proximity is only a projection.",
    equation: "E = \\operatorname{TextEncoder}(t_{1:n})",
  },
  noise: {
    short:
      "There is no hidden image yet. Just a small field of random numbers, waiting to become something.",
    deep: "For a typical 512 × 512 Stable Diffusion image, the latent has 64 × 64 spatial positions and four channels. The VAE compresses the spatial dimensions by eight per side.",
    equation: "x_T \\sim \\mathcal{N}(0,I)",
  },
  denoise: {
    short:
      "One step at a time, the model predicts what to remove. Shapes emerge first. Finer details follow.",
    deep: "A U-Net or transformer predicts a noise-related quantity conditioned on text and time. A scheduler uses that prediction to update the latent. The demo frames are a baked visual analogy, not actual denoising.",
    equation:
      "x_{t-1} = \\operatorname{Scheduler}(x_t, \\epsilon_\\theta(x_t,t,E))",
  },
  attention: {
    short:
      "Words influence different parts of the image. Select a token to see a map of its influence.",
    deep: "Cross-attention compares image queries against text keys. Its weights show one interaction inside a network, not a definitive explanation of causality. Demo maps are simulated; Lab maps are measured where available.",
    equation:
      "\\operatorname{Attention}(Q,K,V)=\\operatorname{softmax}(QK^\\top/\\sqrt{d})V",
  },
  guidance: {
    short:
      "Guidance amplifies the difference between a prediction with your prompt and one without it.",
    deep: "Classic classifier-free guidance extrapolates between unconditional and conditional predictions. Higher values can improve prompt adherence but also cause artifacts. SD-Turbo normally runs with CFG disabled; Lab reports this honestly.",
    equation: "\\hat\\epsilon=\\epsilon_u+w(\\epsilon_c-\\epsilon_u)",
  },
  decode: {
    short:
      "The model has been working in a compact latent space. A decoder now turns that representation into visible pixels.",
    deep: "A VAE decoder upsamples the spatial representation. For Stable Diffusion, eight-times expansion per side turns a 64 × 64 latent into a 512 × 512 image. Token-based models use a different image decoder.",
    equation: "I = \\operatorname{Decoder}(z)",
  },
  edit: {
    short:
      "An edit starts from your reference image. Adding some noise gives the model room to change it.",
    deep: "In img2img, an encoder maps the reference into latent space. Strength determines where the scheduler starts. A lower strength often preserves more structure. Demo reference noising is an analogy and preset edit results are prerecorded.",
    equation: "x_t=\\sqrt{\\bar\\alpha_t}x_0+\\sqrt{1-\\bar\\alpha_t}\\epsilon",
  },
  sequence: {
    short:
      "Here, an image is built as a sequence. Each new image token can use the prompt and all tokens before it.",
    deep: "This is a deterministic illustrative simulator, not a local autoregressive model or a claim about a particular hosted model. Raster order is one possible generation order, and patch thumbnails are an analogy for codebook tokens.",
    equation: "P(z\\mid p)=\\prod_i P(z_i\\mid p,z_{<i})",
  },
  delivery: {
    short:
      "The result is ready. Replay the journey, compare a run, or take the image with you.",
    deep: "Real hosted runs show only returned images, timing, and available usage. No private internal stages or safety decisions are invented. Provider safety checks remain enabled.",
    equation: "\\text{prompt} \\rightarrow \\text{image}",
  },
};
