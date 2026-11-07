import { describe, expect, it } from "vitest";
import { initialPickerState, matches, pickerReducer, pickerSections, type PhoneContact } from "./contact-picker";

const contact = (name: string, phone: string, favourite = false): PhoneContact => ({
  key: `${name}:${phone}`,
  name,
  phone,
  favourite,
});

const mai = contact("Mai", "+84912345678", true);

const huong = contact("Nguyễn Thị Thanh Hương", "+84935662017");

const tuan = contact("Anh Tuấn công ty", "+84977204819");

const dung = contact("Đỗ Dũng", "+84868430925");

describe("searching the phone book", () => {
  it("finds names without tone marks or case", () => {
    expect(matches(huong, "huong")).toBe(true);
    expect(matches(huong, "THANH HƯƠNG")).toBe(true);
    expect(matches(dung, "do dung")).toBe(true);
    expect(matches(tuan, "huong")).toBe(false);
  });

  it("finds numbers as written in Vietnam or with the country code", () => {
    expect(matches(mai, "0912 345")).toBe(true);
    expect(matches(mai, "+84 912")).toBe(true);
    expect(matches(mai, "345678")).toBe(true);
    expect(matches(mai, "0935")).toBe(false);
  });

  it("doesn't match on one or two digits", () => {
    expect(matches(mai, "12")).toBe(false);
  });

  it("puts favourites first while not searching", () => {
    const sections = pickerSections([mai, huong, tuan], "");
    expect(sections.map((s) => [s.key, s.data.length])).toEqual([
      ["favourites", 1],
      ["all", 3],
    ]);
    expect(pickerSections([mai, huong, tuan], "mai").map((s) => s.key)).toEqual(["all"]);
    expect(pickerSections([mai, huong], "zzz")).toEqual([]);
  });
});

describe("ticking people", () => {
  it("keeps the order people were ticked in, and unticks", () => {
    let s = pickerReducer(initialPickerState, { type: "toggle", key: "b", room: 5 });
    s = pickerReducer(s, { type: "toggle", key: "a", room: 5 });
    expect(s.picked).toEqual(["b", "a"]);
    s = pickerReducer(s, { type: "toggle", key: "b", room: 5 });
    expect(s.picked).toEqual(["a"]);
  });

  it("stops at the room left in the circle but still unticks", () => {
    let s = pickerReducer(initialPickerState, { type: "toggle", key: "a", room: 1 });
    s = pickerReducer(s, { type: "toggle", key: "b", room: 1 });
    expect(s.picked).toEqual(["a"]);
    expect(pickerReducer(s, { type: "toggle", key: "a", room: 1 }).picked).toEqual([]);
  });
});
