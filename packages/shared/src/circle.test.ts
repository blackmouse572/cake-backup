import { describe, expect, it } from "vitest";
import { AddCircleContacts, moveId } from "./circle";
import { toE164 } from "./phone";

describe("phone book numbers", () => {
  it("reads the formats phone books store", () => {
    for (const input of ["(+84) 912-345-678", "+84 (0) 912 345 678", "+84.912.345.678", "0912.345.678"]) {
      expect(toE164(input)).toBe("+84912345678");
    }
  });
});

describe("adding contacts", () => {
  it("trims names and refuses empty ones", () => {
    const parsed = AddCircleContacts.parse({ contacts: [{ name: "  Mai ", phone: "0912 345 678" }] });
    expect(parsed.contacts[0]!.name).toBe("Mai");
    expect(AddCircleContacts.safeParse({ contacts: [{ name: "  ", phone: "0912 345 678" }] }).success).toBe(false);
    expect(AddCircleContacts.safeParse({ contacts: [] }).success).toBe(false);
  });
});

describe("moveId", () => {
  const ids = ["a", "b", "c"];

  it("swaps a contact with its neighbour", () => {
    expect(moveId(ids, "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveId(ids, "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("leaves the order alone at either end or for an unknown id", () => {
    expect(moveId(ids, "a", "up")).toEqual(ids);
    expect(moveId(ids, "c", "down")).toEqual(ids);
    expect(moveId(ids, "x", "up")).toEqual(ids);
  });
});
