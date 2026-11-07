import { describe, expect, it } from "vitest";
import { ladderFor, nextStep } from "./escalation";

describe("escalation ladder", () => {
  it("leaves police out unless the user turned it on", () => {
    expect(ladderFor("no_answer", { policeEnabled: false })).toEqual(["circle", "hotline"]);
    expect(ladderFor("no_answer", { policeEnabled: true })).toEqual(["circle", "hotline", "police"]);
  });

  it("only reaches the circle on silence, even with police on", () => {
    expect(ladderFor("lost_contact", { policeEnabled: true })).toEqual(["circle"]);
    expect(nextStep("circle", "lost_contact", { policeEnabled: true })).toBeNull();
  });

  it("climbs one step at a time and stops at the top", () => {
    const s = { policeEnabled: false };
    expect(nextStep("circle", "duress", s)).toBe("hotline");
    expect(nextStep("hotline", "duress", s)).toBeNull();
  });
});
