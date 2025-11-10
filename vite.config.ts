import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Ensure a single instance of these dependencies across the bundle
    dedupe: [
      "jsbi",
      "@uniswap/sdk-core",
      "@uniswap/v3-sdk",
      "@uniswap/v4-sdk",
    ],
  },
  optimizeDeps: {
    include: ["jsbi"],
  },
}));
