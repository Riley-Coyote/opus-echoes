import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standalone Vite SPA for the Sanctuary v2 (phase 1: fixtures-only, zero backend).
// Lives inside the opus-echoes repo but builds independently — it never touches
// the live TanStack app, its routes, or the orb/presence code.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 8270,
    strictPort: false,
  },
  preview: {
    host: "127.0.0.1",
    port: 8270,
  },
});
