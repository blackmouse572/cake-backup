import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
      // Secrets and MESSAGE_SENDER, set as miniflare bindings in vitest.config.ts.
      MESSAGE_SENDER: string;
      BETTER_AUTH_SECRET: string;
      CODE_PEPPER: string;
      DEMO_MODE: string;
    }
  }
}
