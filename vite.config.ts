import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
