import { defineConfig } from "drizzle-kit";

// Migrations are applied with `wrangler d1 migrations apply` from apps/api,
// which reads this folder (see migrations_dir in apps/api/wrangler.jsonc).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./migrations",
});
