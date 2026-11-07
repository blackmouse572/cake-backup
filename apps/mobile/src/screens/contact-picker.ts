import { formatPhone } from "@cage/shared";

/**
 * Screen 09b, without React: searching the phone book and ticking people.
 * Pure, so the rules are tested without a phone.
 */

/** One phone number from the phone book, already in E.164. */
export interface PhoneContact {
  /** Unique per contact and number. */
  key: string;
  name: string;
  phone: string;
  /** Starred in the phone book (Android); shown first as a suggestion. */
  favourite: boolean;
}

/** Lower case, without Vietnamese tone marks, so "huong" finds "Hương". */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase().trim();
}

/** Matches a name without tone marks, or digits anywhere in the number as written in Vietnam or in E.164. */
export function matches(contact: PhoneContact, query: string): boolean {
  const q = fold(query);

  if (!q) return true;

  if (fold(contact.name).includes(q)) return true;
  const digits = q.replace(/\D/g, "");

  if (digits.length < 3 || digits.length !== q.replace(/[\s+().-]/g, "").length) return false;

  return formatPhone(contact.phone).replace(/\D/g, "").includes(digits) || contact.phone.includes(digits);
}

export interface PickerSection {
  key: "favourites" | "all";
  data: PhoneContact[];
}

/** Favourites first (only while not searching), then everyone who matches. */
export function pickerSections(contacts: readonly PhoneContact[], query: string): PickerSection[] {
  const found = contacts.filter((c) => matches(c, query));
  const favourites = query.trim() ? [] : found.filter((c) => c.favourite);
  const sections: PickerSection[] = [];

  if (favourites.length > 0) sections.push({ key: "favourites", data: favourites });

  if (found.length > 0) sections.push({ key: "all", data: found });

  return sections;
}

export interface PickerState {
  query: string;
  /** Keys in the order they were ticked, which becomes the alert order. */
  picked: string[];
}

export type PickerAction = { type: "query"; query: string } | { type: "toggle"; key: string; room: number };

export const initialPickerState: PickerState = { query: "", picked: [] };

/** `room` is how many more people the circle can take; ticking stops there. */
export function pickerReducer(s: PickerState, a: PickerAction): PickerState {
  switch (a.type) {
    case "query":
      return { ...s, query: a.query };
    case "toggle":
      if (s.picked.includes(a.key)) return { ...s, picked: s.picked.filter((k) => k !== a.key) };

      return s.picked.length >= a.room ? s : { ...s, picked: [...s.picked, a.key] };
  }
}
