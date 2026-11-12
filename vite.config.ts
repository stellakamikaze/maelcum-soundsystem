import { defineConfig } from "vite";

// SharedArrayBuffer (motore su più Worker) vuole la pagina isolata: COOP + COEP.
const isolamento = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  server: { headers: isolamento, host: "127.0.0.1", port: 5174 },
  preview: { headers: isolamento, host: "127.0.0.1", port: 4174 },
  worker: { format: "es" },
  build: { target: "es2022" },
});
