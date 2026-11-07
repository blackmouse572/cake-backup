import { describe, expect, it } from "vitest";
import { changeCodesState, codesReducer, initialCodesState, type CodesState } from "./codes.reducer";

const type = (s: CodesState, digits: string) =>
  [...digits].reduce((acc, digit) => codesReducer(acc, { type: "digit", digit }), s);

describe("setting the codes", () => {
  it("asks for each code twice, then submits both", () => {
    let s = type(initialCodesState, "2580");
    expect(s).toMatchObject({ step: "safe", first: "2580", entry: "" });
    s = type(s, "2580");
    expect(s).toMatchObject({ step: "duress", safe: "2580", first: null });
    s = type(type(s, "2591"), "2591");
    expect(s.submit).toEqual({ safe: "2580", duress: "2591" });
  });

  it("refuses an easy code before asking for it again", () => {
    expect(type(initialCodesState, "1234")).toMatchObject({ problem: "too_simple", first: null, entry: "" });
  });

  it("starts the code again when the second entry differs", () => {
    expect(type(initialCodesState, "25801357")).toMatchObject({ step: "safe", problem: "mismatch", first: null });
  });

  it("refuses a duress PIN one digit away from the safe code", () => {
    const s = type(initialCodesState, "25802580");
    expect(type(s, "2581")).toMatchObject({ step: "duress", problem: "too_close" });
  });

  it("ignores typing while saving, and goes back to the safe code on back", () => {
    const saving = type(initialCodesState, "2580258025912591");
    expect(type(saving, "1")).toBe(saving);
    expect(codesReducer(type(initialCodesState, "25802580"), { type: "back" })).toEqual(initialCodesState);
  });

  it("lets the duress PIN be typed again after a failed save", () => {
    const saving = type(initialCodesState, "2580258025912591");
    expect(codesReducer(saving, { type: "saveFailed", problem: "error" })).toMatchObject({
      step: "duress",
      safe: "2580",
      submit: null,
      problem: "error",
    });
    expect(codesReducer(saving, { type: "saveFailed", problem: "too_simple" })).toMatchObject({
      step: "safe",
      safe: "",
      problem: "too_simple",
    });
  });

  it("keeps the codes on screen when a reset is refused during a journey", () => {
    const saving = type(initialCodesState, "2580258025912591");
    expect(codesReducer(saving, { type: "saveFailed", problem: "journey_open" })).toMatchObject({
      step: "duress",
      safe: "2580",
      submit: null,
      problem: "journey_open",
    });
  });
});

const typeAll = (digits: string[]) => digits.reduce(type, changeCodesState);

describe("changing the codes (screen 20a)", () => {
  it("asks for the current safe code once, then each new code twice, and submits all three", () => {
    let s = type(changeCodesState, "2580");
    expect(s).toMatchObject({ step: "safe", current: "2580", first: null, entry: "", problem: null });
    s = type(type(s, "4729"), "4729");
    expect(s).toMatchObject({ step: "duress", safe: "4729", current: "2580" });
    s = type(type(s, "4781"), "4781");
    expect(s.submit).toEqual({ safe: "4729", duress: "4781", current: "2580" });
  });

  it("does not judge the current code, only the server can", () => {
    expect(type(changeCodesState, "1234")).toMatchObject({ step: "safe", current: "1234", problem: null });
  });

  it("asks for the current code again when the server says it was wrong", () => {
    const saving = typeAll(["2580", "4729", "4729", "4781", "4781"]);

    expect(codesReducer(saving, { type: "saveFailed", problem: "wrong_code" })).toMatchObject({
      step: "current",
      current: null,
      entry: "",
      submit: null,
      problem: "wrong_code",
    });
  });

  it("says so when too many wrong codes were tried", () => {
    const saving = typeAll(["2580", "4729", "4729", "4781", "4781"]);

    expect(codesReducer(saving, { type: "saveFailed", problem: "too_many_tries" })).toMatchObject({
      step: "current",
      problem: "too_many_tries",
    });
  });

  it("keeps the current code when the new safe code is refused", () => {
    const saving = typeAll(["2580", "4729", "4729", "4781", "4781"]);

    expect(codesReducer(saving, { type: "saveFailed", problem: "too_simple" })).toMatchObject({
      step: "safe",
      current: "2580",
      safe: "",
      problem: "too_simple",
    });
  });

  it("keeps the current code when going back from the duress PIN", () => {
    const duress = typeAll(["2580", "4729", "4729"]);

    expect(codesReducer(duress, { type: "back" })).toMatchObject({ step: "safe", current: "2580" });
  });

  it("never asks for a current code the first time", () => {
    expect(initialCodesState).toMatchObject({ step: "safe", current: null });
  });
});
