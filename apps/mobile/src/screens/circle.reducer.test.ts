import { CIRCLE } from "@cage/shared";
import { describe, expect, it } from "vitest";
import { circleReducer, initialCircleState, needsNudge, roomLeft, type CircleState } from "./circle.reducer";

const mai = { id: "1", name: "Mai", phone: "+84912345678" };

const daniel = { id: "2", name: "Daniel", phone: "+84908112233" };

const ready = (contacts = [mai]): CircleState => circleReducer(initialCircleState, { type: "loaded", circle: contacts });

describe("the safety circle screen", () => {
  it("nudges for a second person, not for none or two", () => {
    expect(needsNudge(initialCircleState)).toBe(false);
    expect(needsNudge(ready([]))).toBe(false);
    expect(needsNudge(ready([mai]))).toBe(true);
    expect(needsNudge(ready([mai, daniel]))).toBe(false);
  });

  it("closes the sheet once people are saved", () => {
    let s = circleReducer(ready(), { type: "open", sheet: "picker" });
    s = circleReducer(s, { type: "saving" });
    expect(s.busy).toBe(true);
    s = circleReducer(s, { type: "saved", circle: [mai, daniel] });
    expect(s).toMatchObject({ sheet: "none", busy: false, contacts: [mai, daniel] });
  });

  it("keeps the sheet open and says why when a save fails", () => {
    let s = circleReducer(ready(), { type: "open", sheet: "manual" });
    s = circleReducer(circleReducer(s, { type: "saving" }), { type: "saveFailed", problem: "own_number" });
    expect(s).toMatchObject({ sheet: "manual", busy: false, problem: "own_number" });
    expect(circleReducer(s, { type: "open", sheet: "none" }).problem).toBeNull();
  });

  it("falls back to typing a number when contacts can't be read", () => {
    const s = circleReducer(circleReducer(ready(), { type: "open", sheet: "permission" }), {
      type: "noContacts",
      problem: "denied",
    });

    expect(s).toMatchObject({ sheet: "manual", problem: "denied" });
  });

  it("counts the room left in the circle", () => {
    expect(roomLeft(ready([mai, daniel]))).toBe(CIRCLE.max - 2);
  });
});
