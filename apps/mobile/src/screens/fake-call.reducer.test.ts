import { describe, expect, it } from "vitest";
import {
  CALLER_NAME_MAX,
  RING_FOR_MS,
  callerName,
  fakeCallOff,
  fakeCallReducer,
  secondsUntilRing,
  type FakeCall,
  type FakeCallAction,
} from "./fake-call.reducer";

const run = (...actions: FakeCallAction[]): FakeCall => actions.reduce(fakeCallReducer, fakeCallOff);

const presetName = (preset: string) => `preset:${preset}`;

describe("the fake call", () => {
  it("opens on the picker with Mom and 30 seconds", () => {
    expect(run({ type: "open" })).toEqual({ name: "picking", preset: "mom", typed: "", delayMs: 30_000 });
  });

  it("uses a typed name over the picked one, and a chip clears the typing", () => {
    const typed = run({ type: "open" }, { type: "type", text: "  Anh Tuấn " });

    if (typed.name !== "picking") throw new Error("expected the picker");
    expect(callerName(typed, presetName)).toBe("Anh Tuấn");

    const picked = fakeCallReducer(typed, { type: "pickPreset", preset: "boss" });

    if (picked.name !== "picking") throw new Error("expected the picker");
    expect(callerName(picked, presetName)).toBe("preset:boss");
  });

  it("keeps a typed name to one line", () => {
    expect(run({ type: "open" }, { type: "type", text: "x".repeat(80) })).toMatchObject({ typed: "x".repeat(CALLER_NAME_MAX) });
  });

  it("waits the picked delay, then rings", () => {
    const waiting = run({ type: "open" }, { type: "pickDelay", delayMs: 5_000 }, { type: "schedule", callerName: "Mẹ", at: 1_000 });

    expect(waiting).toEqual({ name: "waiting", callerName: "Mẹ", ringAt: 6_000 });
    expect(secondsUntilRing(waiting, 1_500)).toBe(5);
    expect(fakeCallReducer(waiting, { type: "tick", at: 5_999 })).toBe(waiting);
    expect(fakeCallReducer(waiting, { type: "tick", at: 6_000 })).toEqual({ name: "ringing", callerName: "Mẹ", since: 6_000 });
  });

  it("does not schedule a call with no name", () => {
    const picking = run({ type: "open" });

    expect(fakeCallReducer(picking, { type: "schedule", callerName: "   ", at: 0 })).toBe(picking);
  });

  it("answers into a call that starts its timer", () => {
    const inCall = run(
      { type: "open" },
      { type: "schedule", callerName: "Mẹ", at: 0 },
      { type: "tick", at: 30_000 },
      { type: "answer", at: 31_000 },
    );

    expect(inCall).toEqual({ name: "inCall", callerName: "Mẹ", startedAt: 31_000 });
  });

  it("stops ringing on its own, like a missed call", () => {
    const ringing = run({ type: "open" }, { type: "schedule", callerName: "Mẹ", at: 0 }, { type: "tick", at: 30_000 });

    expect(fakeCallReducer(ringing, { type: "tick", at: 30_000 + RING_FOR_MS - 1 })).toBe(ringing);
    expect(fakeCallReducer(ringing, { type: "tick", at: 30_000 + RING_FOR_MS })).toEqual(fakeCallOff);
  });

  it("goes back to the trip from any step", () => {
    const steps: FakeCall[] = [
      run({ type: "open" }),
      run({ type: "open" }, { type: "schedule", callerName: "Mẹ", at: 0 }),
      run({ type: "open" }, { type: "schedule", callerName: "Mẹ", at: 0 }, { type: "tick", at: 30_000 }),
      run({ type: "open" }, { type: "schedule", callerName: "Mẹ", at: 0 }, { type: "tick", at: 30_000 }, { type: "answer", at: 30_500 }),
    ];

    for (const step of steps) expect(fakeCallReducer(step, { type: "stop" })).toEqual(fakeCallOff);
  });

  it("ignores a second open while a call is on its way", () => {
    const waiting = run({ type: "open" }, { type: "schedule", callerName: "Mẹ", at: 0 });

    expect(fakeCallReducer(waiting, { type: "open" })).toBe(waiting);
  });
});

describe("the fake call stays on the phone", () => {
  // The issue's "done when": it rings without any network call. The screen and its rules import no service and never fetch.
  const files = import.meta.glob("./fake-call*.{ts,tsx}", { query: "?raw", import: "default", eager: true });

  it("reads both files", () => {
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["./fake-call.reducer.ts", "./fake-call.tsx"]));
  });

  for (const [file, source] of Object.entries(files)) {
    it(`${file} never reaches the server`, () => {
      expect(source).not.toMatch(/from "\.\.\/services|from "\.\.\/auth"|\bfetch\(/);
    });
  }
});
