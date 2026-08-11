import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "./manifest.json";

const __dir = dirname(fileURLToPath(import.meta.url));
const pkg = (name: string) => resolve(__dir, `../../packages/${name}/src/index.ts`);

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      "@salesforce-xray/parser": pkg("parser"),
      "@salesforce-xray/analyzer": pkg("analyzer"),
      "@salesforce-xray/salesforce": pkg("salesforce"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});
