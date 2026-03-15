import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: [
        "favicon.png",
        "logo.png",
        "pwa-192x192.png",
        "pwa-512x512.png",
      ],
      devOptions: {
        enabled: true,
      },
      manifest: {
        name: "KiwiFreeTV",
        short_name: "KiwiFreeTV",
        description: "Free-to-air TV channels from New Zealand",
        theme_color: "#a94332",
        start_url: "/",
        display: "standalone",
        background_color: "#080808",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/proxy": "http://localhost:3000",
      "/catalog": "http://localhost:3000",
      "/meta": "http://localhost:3000",
      "/stream": "http://localhost:3000",
      "/manifest.json": "http://localhost:3000",
      "/ping": "http://localhost:3000",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    // setupFiles: "./vitest.setup.ts",
    include: ["tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
  },
});
