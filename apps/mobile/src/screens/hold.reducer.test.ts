import { TIMERS } from "@cage/shared";
import { describe, expect, it } from "vitest";
import { holdReducer, idleHold, type HoldAction, type HoldState } from "./hold.reducer";

const run = (...actions: HoldAction[]): HoldState => actions.reduce(holdReducer, idleHold);

describe("holding the SOS button", () => {
  it("takes one second, as the PRD says", () => {
    expect(TIMERS.sosHoldMs).toBe(1_000);
  });

  it("starts with nothing held", () => {
    expect(idleHold).toEqual({ startedAt: null, progress: 0, fired: false });
  });

  it("fills as time passes", () => {
    expect(run({ type: "press", at: 5_000 }, { type: "tick", at: 5_500 })).toMatchObject({ progress: 0.5, fired: false });
  });

  it("does not fire a moment before the second is up", () => {
    expect(run({ type: "press", at: 5_000 }, { type: "tick", at: 5_999 }).fired).toBe(false);
  });

  it("fires once the second is up, and stays full if held longer", () => {
    expect(run({ type: "press", at: 5_000 }, { type: "tick", at: 6_000 })).toMatchObject({ progress: 1, fired: true });
    expect(run({ type: "press", at: 5_000 }, { type: "tick", at: 9_000 })).toMatchObject({ progress: 1, fired: true });
  });

  it("forgets everything when the finger lifts early", () => {
    expect(run({ type: "press", at: 5_000 }, { type: "tick", at: 5_700 }, { type: "release" })).toEqual(idleHold);
  });

  it("ignores time passing while nothing is held", () => {
    expect(run({ type: "tick", at: 5_000 })).toEqual(idleHold);
  });

  it("starts over on the next press", () => {
    const again = run(
      { type: "press", at: 1_000 },
      { type: "tick", at: 1_800 },
      { type: "release" },
      { type: "press", at: 4_000 },
      { type: "tick", at: 4_200 },
    );

    expect(again).toMatchObject({ progress: 0.2, fired: false });
  });
});
