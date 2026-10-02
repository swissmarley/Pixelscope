import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  // GitHub Pages serves project sites from /<repository>/.
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), tailwind()],
  build: {
    rollupOptions: {
      output: { manualChunks: { math: ["katex"], motion: ["motion/react"] } },
    },
  },
});
