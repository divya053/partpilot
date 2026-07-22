import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontend dev server proxies /api to the PartPilot backend (port 4100).
// For a subpath deploy (e.g. https://host/partpilot/), build with
//   VITE_BASE_PATH=/partpilot/ npm run build
export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4100",
        changeOrigin: true,
      },
    },
  },
});
