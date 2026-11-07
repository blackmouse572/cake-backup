import { describe, expect, it } from "vitest";
import { Me, SetSettings } from "./me";

describe("saving settings", () => {
  it("takes a language on its own", () => {
    expect(SetSettings.parse({ locale: "en" })).toEqual({ locale: "en" });
  });

  it("takes the police switch on its own", () => {
    expect(SetSettings.parse({ policeEnabled: true })).toEqual({ policeEnabled: true });
  });

  it("takes both together", () => {
    expect(SetSettings.parse({ locale: "vi", policeEnabled: false })).toEqual({ locale: "vi", policeEnabled: false });
  });

  it("refuses an empty body, because it would change nothing", () => {
    expect(SetSettings.safeParse({}).success).toBe(false);
  });

  it("refuses a language the app does not have", () => {
    expect(SetSettings.safeParse({ locale: "fr" }).success).toBe(false);
  });

  it("refuses a police switch that is not a boolean", () => {
    expect(SetSettings.safeParse({ policeEnabled: "yes" }).success).toBe(false);
  });
});

describe("what /me says about the police switch", () => {
  it("is part of the account the app reads", () => {
    const me = Me.parse({
      phoneNumber: "+84912345678",
      name: "Lan",
      hasCodes: true,
      circleSize: 2,
      locale: "vi",
      policeEnabled: false,
    });

    expect(me.policeEnabled).toBe(false);
  });
});
