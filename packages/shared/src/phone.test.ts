import { describe, expect, it } from "vitest";
import { formatPhone, toE164 } from "./phone";

describe("phone numbers", () => {
  it("reads Vietnamese numbers however they are typed", () => {
    for (const input of ["0912 345 678", "912345678", "+84 912 345 678", "84912345678", "0084912345678"]) {
      expect(toE164(input)).toBe("+84912345678");
    }
  });

  it("rejects numbers that are too short or too long", () => {
    expect(toE164("0912 345")).toBeNull();
    expect(toE164("0912 345 6789")).toBeNull();
    expect(toE164("")).toBeNull();
  });

  it("keeps foreign numbers typed with a plus", () => {
    expect(toE164("+855 12 345 678")).toBe("+85512345678");
  });

  it("writes numbers the Vietnamese way", () => {
    expect(formatPhone("+84912345678")).toBe("0912 345 678");
  });
});
