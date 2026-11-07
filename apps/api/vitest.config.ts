import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("../../packages/db/migrations");

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            MESSAGE_SENDER: "none",
            BETTER_AUTH_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
            CODE_PEPPER: "test-pepper",
            DEMO_MODE: "on",
            DEMO_KEY: "test-demo-key",
          },
        },
      }),
    ],
    test: { setupFiles: ["./test/apply-migrations.ts"] },
  };
});
