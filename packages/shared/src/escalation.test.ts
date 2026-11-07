import { describe, expect, it } from "vitest";
import { ladderFor, nextStep, outranks } from "./escalation";

describe("escalation ladder", () => {
  it("leaves police out unless the user turned it on", () => {
    expect(ladderFor("no_answer", { policeEnabled: false })).toEqual(["circle", "hotline"]);
    expect(ladderFor("no_answer", { policeEnabled: true })).toEqual(["circle", "hotline", "police"]);
  });

  it("only reaches the circle on silence, even with police on", () => {
    expect(ladderFor("lost_contact", { policeEnabled: true })).toEqual(["circle"]);
    expect(nextStep("circle", "lost_contact", { policeEnabled: true })).toBeNull();
  });

  it("lets the duress PIN replace any other alert, and never the other way round", () => {
    expect(outranks("duress", "no_answer")).toBe(true);
    expect(outranks("duress", "lost_contact")).toBe(true);
    expect(outranks("sos", "lost_contact")).toBe(true);
    expect(outranks("sos", "no_answer")).toBe(false);
    expect(outranks("no_answer", "sos")).toBe(false);
    expect(outranks("no_answer", "lost_contact")).toBe(true);
    expect(outranks("no_answer", "duress")).toBe(false);
    expect(outranks("lost_contact", "no_answer")).toBe(false);
    expect(outranks("duress", "duress")).toBe(false);
  });

  it("climbs one step at a time and stops at the top", () => {
    const s = { policeEnabled: false };
    expect(nextStep("circle", "duress", s)).toBe("hotline");
    expect(nextStep("hotline", "duress", s)).toBeNull();
  });
});
