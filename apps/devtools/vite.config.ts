import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const pkg = (name: string) => resolve(__dir, `../../packages/${name}/src/index.ts`);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@salesforce-xray/parser": pkg("parser"),
      "@salesforce-xray/analyzer": pkg("analyzer"),
    },
  },
  // Serve fixtures from the repo root so /fixtures/<file> works in dev
  publicDir: resolve(__dir, "../../fixtures/logs"),
  server: {
    port: 5173,
    open: true,
  },
});
