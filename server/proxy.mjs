import express from "express";
import { randomUUID } from "node:crypto";

const app = express();
app.disable("x-powered-by");
const origins = new Set(
  (
    process.env.PIXELSCOPE_ORIGINS ||
    "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173,https://swissmarley.github.io"
  )
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);
const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
app.use((req, res, next) => {
  // Only answer requests addressed to this machine, which blocks DNS rebinding.
  const host = (req.headers.host || "").replace(/:\d+$/, "").toLowerCase();
  if (!localHosts.has(host))
    return res.status(403).json({ error: "Host is not allowed." });
  const origin = req.headers.origin;
  if (origin && !origins.has(origin))
    return res.status(403).json({ error: "Origin is not allowed." });
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
  // Chrome asks before a public HTTPS page (such as GitHub Pages) reaches localhost.
  if (
    origin &&
    req.headers["access-control-request-private-network"] === "true"
  )
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "14mb" }));
let active = 0;
app.get("/health", (_req, res) =>
  res.json({
    status: "ready",
    providers: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
    },
  }),
);
/** The image type a file's leading bytes identify, if it is PNG, JPEG or WebP. */
function sniffMime(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
    return "image/png";
  if (bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")))
    return "image/jpeg";
  if (
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "image/webp";
  return undefined;
}
function imageInput(reference) {
  if (reference === undefined || reference === null || reference === "")
    return undefined;
  if (typeof reference !== "string")
    throw Error("Reference must be a PNG, JPEG or WebP data URL.");
  const match = reference.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!match) throw Error("Reference must be a PNG, JPEG or WebP data URL.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 10 * 1024 * 1024)
    throw Error("Reference image exceeds 10 MB.");
  if (sniffMime(bytes) !== match[1])
    throw Error("Reference bytes are not a valid PNG, JPEG or WebP image.");
  return { mime: match[1], data: match[2], bytes };
}
const outputFormats = new Set(["png", "jpeg", "webp"]);
async function* parseProviderStream(response, signal) {
  const reader = response.body.getReader();
  let buffer = "";
  const decoder = new TextDecoder();
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(
        /\r\n/g,
        "\n",
      );
      let end;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const packet = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = packet
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("\n");
        if (!data || data === "[DONE]") continue;
        let event;
        try {
          event = JSON.parse(data);
        } catch {
          throw Error(
            "The provider sent a stream event that could not be read.",
          );
        }
        yield event;
      }
    }
  } finally {
    await reader.cancel();
  }
}
app.post("/api/generate", async (req, res) => {
  const { prompt, provider, model, reference } = req.body || {};
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000)
    return res
      .status(400)
      .json({ error: "Enter a prompt of 1 to 4000 characters." });
  if (
    !["openai", "gemini"].includes(provider) ||
    typeof model !== "string" ||
    !/^[a-zA-Z0-9._-]{1,100}$/.test(model)
  )
    return res
      .status(400)
      .json({ error: "Select a valid provider and model." });
  const key =
    provider === "openai"
      ? process.env.OPENAI_API_KEY
      : process.env.GEMINI_API_KEY;
  if (!key)
    return res.status(503).json({
      error: `Set ${provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"} in the server-side .env file and restart the proxy.`,
    });
  let image;
  try {
    image = imageInput(reference);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  if (active >= 2)
    return res.status(429).json({
      error: "Two runs are already active. Try again when one completes.",
    });
  active++;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240000);
  res.on("close", () => controller.abort());
  const start = performance.now();
  const send = (stage, type, data = {}, duration = 400) => {
    if (!res.destroyed)
      res.write(
        `data: ${JSON.stringify({ id: randomUUID(), stage, type, duration, elapsed: performance.now() - start, provenance: "observed", ...data })}\n\n`,
      );
  };
  try {
    send("request", "request_built", {
      request: {
        provider,
        model,
        prompt,
        size: provider === "openai" ? "1024x1024" : "provider default",
        reference_images: image ? 1 : 0,
        quality: provider === "openai" ? "medium" : undefined,
      },
    });
    send("request", "sent", { model });
    let finalImage;
    let usage;
    let size = "Provider output";
    if (provider === "openai") {
      const request = {
        model,
        prompt,
        size: "1024x1024",
        quality: "medium",
        n: 1,
        stream: true,
        partial_images: 2,
      };
      let body;
      let headers = { Authorization: `Bearer ${key}` };
      if (image) {
        const form = new FormData();
        for (const [k, v] of Object.entries(request)) form.append(k, String(v));
        form.append(
          "image",
          new Blob([image.bytes], { type: image.mime }),
          "reference." +
            (image.mime === "image/jpeg" ? "jpg" : image.mime.split("/")[1]),
        );
        body = form;
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(request);
      }
      const response = await fetch(
        `https://api.openai.com/v1/images/${image ? "edits" : "generations"}`,
        { method: "POST", headers, body, signal: controller.signal },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw Error(
          error.error?.message || `OpenAI returned ${response.status}.`,
        );
      }
      for await (const event of parseProviderStream(
        response,
        controller.signal,
      )) {
        if (event.type === "error" || event.error)
          throw Error(
            event.message ||
              event.error?.message ||
              "Provider generation failed.",
          );
        if (event.b64_json) {
          const format = outputFormats.has(event.output_format)
            ? event.output_format
            : "png";
          const url = `data:image/${format};base64,${event.b64_json}`;
          if (event.type?.includes("partial_image"))
            send(
              "delivery",
              "partial_image",
              { image: url, index: event.partial_image_index || 0 },
              500,
            );
          else {
            finalImage = url;
            send("delivery", "final_image", { image: url });
          }
        }
        if (event.usage) usage = event.usage;
      }
      size = "1024 × 1024";
    } else {
      const parts = [{ text: prompt }];
      if (image)
        parts.push({ inlineData: { mimeType: image.mime, data: image.data } });
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
          }),
          signal: controller.signal,
        },
      );
      const result = await response.json().catch(() => {
        throw Error(
          `Gemini returned an unreadable response (${response.status}).`,
        );
      });
      if (!response.ok)
        throw Error(
          result.error?.message || `Gemini returned ${response.status}.`,
        );
      const images =
        result.candidates
          ?.flatMap((c) => c.content?.parts || [])
          .filter((p) =>
            ["image/png", "image/jpeg", "image/webp"].includes(
              p.inlineData?.mimeType,
            ),
          ) || [];
      for (const part of images) {
        finalImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        send("delivery", "final_image", { image: finalImage });
      }
      usage = result.usageMetadata;
      if (!finalImage)
        throw Error(
          result.promptFeedback?.blockReason
            ? `Provider blocked the request: ${result.promptFeedback.blockReason}`
            : "The provider did not return an image. Check the model and prompt.",
        );
    }
    if (!finalImage)
      throw Error("The provider stream ended without a final image.");
    if (usage) send("delivery", "usage", { usage });
    send("delivery", "done", {
      metadata: { model, size, seconds: (performance.now() - start) / 1000 },
    });
  } catch (e) {
    if (!res.destroyed) {
      const message = controller.signal.aborted
        ? "The request timed out or was cancelled."
        : e instanceof Error
          ? e.message
          : "Provider request failed.";
      res.write(
        `data: ${JSON.stringify({ error: message.replaceAll(key, "[redacted]") })}\n\n`,
      );
    }
  } finally {
    clearTimeout(timer);
    active--;
    res.end();
  }
});
app.use((err, _req, res, _next) =>
  res.status(400).json({
    error:
      err.type === "entity.too.large"
        ? "Request exceeds 14 MB."
        : "Invalid request.",
  }),
);
const port = Number(process.env.PORT || 3001);
app.listen(port, "127.0.0.1", () =>
  console.log(`Pixelscope proxy: http://127.0.0.1:${port}`),
);
