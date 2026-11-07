import { describe, expect, it } from "vitest";
import { z } from "zod";
import config from "../wrangler.jsonc?raw";

/** wrangler.jsonc without its comments and trailing commas, leaving strings (and the URLs in them) alone. */
function parseJsonc(text: string): z.infer<typeof Config> {
  const json = text
    .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, str: string | undefined) => str ?? "")
    .replace(/,(\s*[}\]])/g, "$1");

  return Config.parse(JSON.parse(json));
}

const Vars = z.object({ vars: z.record(z.string(), z.string()).optional() });

const Config = Vars.extend({ env: z.record(z.string(), Vars) });

describe("wrangler.jsonc", () => {
  const { env } = parseJsonc(config);

  it("never opens the demo routes on staging or production", () => {
    expect(env.production?.vars?.DEMO_MODE).toBeUndefined();
    expect(env.staging?.vars?.DEMO_MODE).toBeUndefined();
  });

  it("keeps the demo's messages out of real phones", () => {
    expect(env.demo?.vars?.MESSAGE_SENDER).toBe("console");
  });
});
