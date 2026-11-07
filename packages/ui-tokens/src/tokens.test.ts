import { describe, expect, it } from "vitest";
import { color, cssVariables } from "./index";

describe("css variables", () => {
  it("uses the canvas variable names", () => {
    const css = cssVariables();
    expect(css).toContain("--fg-primary:#111111");
    expect(css).toContain("--blue:#0090ff");
    expect(css).toContain("--radius-md:20px");
    expect(css).toContain('--font-lora:"Geist Serif"');
  });

  it("keeps route blue apart from danger", () => {
    expect(color.blue).not.toBe(color.danger);
  });
});
