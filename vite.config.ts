import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // three.js dominates the bundle (~500kB): isolate vendor churn
        // from app code for cache stability.
        manualChunks: { three: ["three"] },
      },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  root: fileURLToPath(new URL(".", import.meta.url)),
});
