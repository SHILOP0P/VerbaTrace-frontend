import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { compressedAssets } from "./plugins/compressed-assets";

export default defineConfig(({ command }) => {
  if (command !== "build") throw new Error("Use npm run start: the compiled site runs on port 5173.");
  return {
    plugins: [react(), compressedAssets()],
    build: {
      manifest: true,
      sourcemap: false,
      rollupOptions: {
        // Public pages and the authenticated application have separate entries.
        // Workspace screens never enter the public landing bundle.
        input: {
          main: fileURLToPath(new URL("./index.html", import.meta.url)),
          app: fileURLToPath(new URL("./app.html", import.meta.url)),
          product: fileURLToPath(new URL("./product.html", import.meta.url)),
          pricing: fileURLToPath(new URL("./pricing.html", import.meta.url)),
          integrations: fileURLToPath(new URL("./integrations.html", import.meta.url)),
          legal: fileURLToPath(new URL("./legal.html", import.meta.url))
        },
        output: {
          // Keep stable runtimes cacheable without pulling workspace code into
          // the landing or React into the deferred 3D chunk.
          onlyExplicitManualChunks: true,
          manualChunks(id) {
            const modulePath = id.replaceAll("\\", "/");
            // The CommonJS helper must stay with React; otherwise Rollup can
            // put it into an application chunk that imports React back.
            if (modulePath.includes("commonjsHelpers.js")) return "react-vendor";
            if (/\/node_modules\/(react|react-dom|scheduler)\//.test(modulePath)) return "react-vendor";
            // Shared icons otherwise become dozens of tiny network requests.
            if (/\/node_modules\/lucide-react\//.test(modulePath)) return "icons";
            if (/\/node_modules\/three\//.test(modulePath)) return "three-vendor";
          }
        }
      }
    }
  };
});
