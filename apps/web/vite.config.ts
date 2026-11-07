import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      // `bun run dev` here also runs the API Worker, so the API service
      // binding works locally without a second terminal.
      auxiliaryWorkers: [{ configPath: "../api/wrangler.jsonc" }],
    }),
    tanstackStart(),
    viteReact(),
  ],
});
