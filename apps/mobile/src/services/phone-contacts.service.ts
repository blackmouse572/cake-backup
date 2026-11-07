import { toE164 } from "@cage/shared";
import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from "expo-contacts";
import type { PhoneContact } from "../screens/contact-picker";

/**
 * The phone's own contacts (expo-contacts). They are read on the phone only:
 * nothing leaves it except the people the traveller ticks (screen 09a).
 */

export type ContactsAccess = "granted" | "denied" | "ask";

const access = (res: { granted: boolean; canAskAgain: boolean }): ContactsAccess =>
  res.granted ? "granted" : res.canAskAgain ? "ask" : "denied";

export async function contactsAccess(): Promise<ContactsAccess> {
  try {
    return access(await getPermissionsAsync());
  } catch {
    return "denied";
  }
}

/** Shows the system prompt (iOS 18 may grant only some contacts, which is fine). */
export async function requestContactsAccess(): Promise<ContactsAccess> {
  try {
    return access(await requestPermissionsAsync());
  } catch {
    return "denied";
  }
}

const FIELDS = [ContactField.FULL_NAME, ContactField.PHONES, ContactField.IS_FAVOURITE] as const;

/**
 * One entry per phone number that can be messaged, so someone with two
 * numbers shows twice with each number. Null when the phone book can't be read.
 */
export async function readPhoneContacts(): Promise<PhoneContact[] | null> {
  try {
    const all = await Contact.getAllDetails(FIELDS);
    const out: PhoneContact[] = [];

    for (const c of all) {
      const name = c.fullName?.trim();

      if (!name) continue;
      const seen = new Set<string>();

      for (const p of c.phones ?? []) {
        const e164 = p.number ? toE164(p.number) : null;

        if (!e164 || seen.has(e164)) continue;
        seen.add(e164);
        out.push({ key: `${c.id}:${e164}`, name, phone: e164, favourite: Boolean(c.isFavourite) });
      }
    }

    return out.toSorted((a, b) => a.name.localeCompare(b.name, "vi"));
  } catch {
    return null;
  }
}
