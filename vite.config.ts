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
      rollupOptions: {
        // The demo screen is a second document: the landing's 3D monitors show it
        // in an iframe, and it runs the real interface on fixture data.
        input: {
          main: fileURLToPath(new URL("./index.html", import.meta.url)),
          demo: fileURLToPath(new URL("./demo.html", import.meta.url))
        },
        output: {
          // Keep stable runtimes cacheable without pulling workspace code into
          // the landing or React into the deferred 3D chunk.
          onlyExplicitManualChunks: true,
          manualChunks(id) {
            const modulePath = id.replaceAll("\\", "/");
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
