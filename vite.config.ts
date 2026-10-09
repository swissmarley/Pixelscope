import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
// The static site loads nothing from third parties. Lab and the proxy are
// user-configured servers, so connections may go to any http(s) origin;
// data: and blob: cover fetches of images that are already in memory.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' http: https: data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");
// Build only: the dev server injects inline scripts for hot reload.
const csp: Plugin = {
  name: "pixelscope-csp",
  apply: "build",
  transformIndexHtml: () => [
    {
      tag: "meta",
      attrs: {
        "http-equiv": "Content-Security-Policy",
        content: contentSecurityPolicy,
      },
      injectTo: "head-prepend",
    },
  ],
};
export default defineConfig({
  // GitHub Pages serves project sites from /<repository>/.
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), tailwind(), csp],
  build: {
    rollupOptions: {
      output: { manualChunks: { math: ["katex"], motion: ["motion/react"] } },
    },
  },
});
