import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // The demo screen is a second document: the landing's 3D monitors show it
      // in an iframe, and it runs the real interface on fixture data.
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        demo: fileURLToPath(new URL("./demo.html", import.meta.url))
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    // A drifting port or host changes the cookie origin and silently signs the user out.
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true
      },
      "/health": {
        target: "http://localhost:8080",
        changeOrigin: true
      }
    }
  }
});
