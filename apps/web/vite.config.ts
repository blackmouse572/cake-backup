import { Buffer } from "node:buffer";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const removeMissingMapLibreSourceMap: Plugin = {
  name: "remove-missing-maplibre-source-map",
  generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (
        output.type !== "asset" ||
        !output.fileName.startsWith("assets/maplibre-gl-worker-")
      ) {
        continue;
      }

      const source = Buffer.from(output.source).toString("utf8");

      const cleanedSource = source.replace(/\n\/\/# sourceMappingURL=maplibre-gl-worker\.mjs\.map\s*$/, "");

      output.source = Buffer.from(cleanedSource);
    }
  },
};

export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      // `bun run dev` here also runs the API Worker, so the API service
      // binding works locally without a second terminal.
      auxiliaryWorkers: [{ configPath: "../api/wrangler.jsonc" }],
    }),
    removeMissingMapLibreSourceMap,
    tanstackStart(),
    viteReact(),
  ],
});
