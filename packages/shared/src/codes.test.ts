import { describe, expect, it } from "vitest";
import { codesProblem, differingDigits, isTooSimple } from "./codes";

describe("codes", () => {
  it("accepts two ordinary codes that differ in two digits", () => {
    expect(codesProblem("2580", "2591")).toBeNull();
  });

  it("refuses anything but four digits", () => {
    expect(codesProblem("258", "2591")).toBe("format");
    expect(codesProblem("25801", "2591")).toBe("format");
    expect(codesProblem("25a0", "2591")).toBe("format");
  });

  it("refuses codes anyone would guess first", () => {
    for (const code of ["0000", "7777", "1234", "6789", "4321", "9876"]) expect(isTooSimple(code)).toBe(true);

    for (const code of ["2580", "1357", "1123", "0912"]) expect(isTooSimple(code)).toBe(false);
    expect(codesProblem("1234", "2591")).toBe("too_simple");
  });

  it("refuses a duress PIN one slip away from the safe code", () => {
    expect(differingDigits("2580", "2581")).toBe(1);
    expect(codesProblem("2580", "2581")).toBe("too_close");
    expect(codesProblem("2580", "2580")).toBe("too_close");
  });
});
