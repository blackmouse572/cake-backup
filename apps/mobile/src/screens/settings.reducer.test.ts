import { describe, expect, it } from "vitest";
import { initialSettings, settingsReducer, type SettingsAction, type SettingsState } from "./settings.reducer";

const run = (start: SettingsState, ...actions: SettingsAction[]) => actions.reduce(settingsReducer, start);

const typeDigits = (state: SettingsState, digits: string) =>
  [...digits].reduce((acc, digit) => settingsReducer(acc, { type: "digit", digit }), state);

const list = initialSettings({ policeEnabled: false });

describe("the settings list (screen 20)", () => {
  it("starts on the list, with the police switch as the server has it", () => {
    expect(initialSettings({ policeEnabled: true })).toMatchObject({ view: "list", policeEnabled: true });
  });

  it("opens the language screen and the codes screen, and comes back to the list", () => {
    const language = run(list, { type: "open", view: "language" });
    expect(language.view).toBe("language");
    expect(run(language, { type: "back" }).view).toBe("list");

    const codes = run(list, { type: "open", view: "codes" });
    expect(codes.view).toBe("codes");
    expect(run(codes, { type: "back" }).view).toBe("list");
  });
});

describe("the police switch", () => {
  it("flips at once and waits for the server", () => {
    expect(run(list, { type: "togglePolice" })).toMatchObject({ policeEnabled: true, savingPolice: true });
  });

  it("stays flipped once the server has saved it", () => {
    expect(run(list, { type: "togglePolice" }, { type: "policeSaved" })).toMatchObject({
      policeEnabled: true,
      savingPolice: false,
      problem: null,
    });
  });

  it("goes back and says why when the server could not save it", () => {
    expect(run(list, { type: "togglePolice" }, { type: "policeFailed" })).toMatchObject({
      policeEnabled: false,
      savingPolice: false,
      problem: "error",
    });
  });

  it("ignores a second tap while the first is still being saved", () => {
    const saving = run(list, { type: "togglePolice" });

    expect(run(saving, { type: "togglePolice" })).toEqual(saving);
  });
});

describe("signing out with the safe code", () => {
  const entering = run(list, { type: "open", view: "signOut" });

  it("asks for the code, and sends it once four digits are typed", () => {
    expect(entering.view).toBe("signOut");
    expect(typeDigits(entering, "258")).toMatchObject({ entry: "258", submit: null });
    expect(typeDigits(entering, "2580")).toMatchObject({ entry: "2580", submit: "2580" });
  });

  it("takes no more digits once the code is on its way", () => {
    const sent = typeDigits(entering, "2580");

    expect(typeDigits(sent, "1")).toEqual(sent);
  });

  it("deletes the last digit", () => {
    expect(run(typeDigits(entering, "25"), { type: "delete" }).entry).toBe("2");
  });

  it("is signed out once the server says ok", () => {
    expect(run(typeDigits(entering, "2580"), { type: "signOutResult", result: "ok" }).signedOut).toBe(true);
  });

  it("clears the digits and says why after a wrong code, so the next try starts fresh", () => {
    const after = run(typeDigits(entering, "1357"), { type: "signOutResult", result: "wrong_code" });

    expect(after).toMatchObject({ view: "signOut", entry: "", submit: null, problem: "wrong_code", signedOut: false });
    expect(typeDigits(after, "2580").submit).toBe("2580");
  });

  it.each(["too_many_tries", "error"] as const)("says why after %s", (result) => {
    expect(run(typeDigits(entering, "2580"), { type: "signOutResult", result })).toMatchObject({
      entry: "",
      problem: result,
      signedOut: false,
    });
  });

  it("forgets the digits and the problem when you go back", () => {
    const wrong = run(typeDigits(entering, "1357"), { type: "signOutResult", result: "wrong_code" });

    expect(run(wrong, { type: "back" })).toMatchObject({ view: "list", entry: "", problem: null });
  });
});
