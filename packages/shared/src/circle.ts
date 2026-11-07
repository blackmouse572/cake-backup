import { z } from "zod";
import { E164 } from "./phone";

/**
 * The safety circle (vòng an toàn): the trusted contacts a traveller picks
 * from their phone. Contacts have no account; they get messages by SMS and
 * Zalo (ADR 0002). In-app summaries say "vòng an toàn" and never list the
 * contacts' names (GLOSSARY).
 */
export const CIRCLE = {
  /** Fewer than this and the app nudges for another person (PRD, "Escalation ladder"). */
  recommended: 2,
  /** Each contact is messaged on every alert, and every message costs money. */
  max: 10,
  /** Longest name kept, in characters; phone books hold some long ones. */
  nameMax: 80,
} as const;

/** One contact as the API returns it, in alert order. */
export const CircleContact = z.object({
  id: z.string(),
  name: z.string(),
  /** E.164, e.g. +84912345678. */
  phone: E164,
});

export type CircleContact = z.infer<typeof CircleContact>;

/** A contact to add: the phone number as the phone book or the traveller wrote it. */
export const NewCircleContact = z.object({
  name: z.string().trim().min(1).max(CIRCLE.nameMax),
  phone: z.string().trim().min(1).max(32),
});

export type NewCircleContact = z.infer<typeof NewCircleContact>;

/** Body of `POST /circle`: one or more contacts, e.g. everyone ticked on screen 09b. */
export const AddCircleContacts = z.object({
  contacts: z.array(NewCircleContact).min(1).max(CIRCLE.max),
});

export type AddCircleContacts = z.infer<typeof AddCircleContacts>;

/** Body of `PUT /circle/order`: every contact's id, first to be alerted first. */
export const ReorderCircle = z.object({
  ids: z.array(z.string()).min(1).max(CIRCLE.max),
});

export type ReorderCircle = z.infer<typeof ReorderCircle>;

/** `GET /circle` and the answer to every change: the whole circle, in order. */
export const Circle = z.array(CircleContact);

export type Circle = z.infer<typeof Circle>;

/**
 * Moves one id up or down a list by one place. Returns the list unchanged
 * when the id is missing or already at that end.
 */
export function moveId(ids: readonly string[], id: string, direction: "up" | "down"): string[] {
  const from = ids.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;

  if (from === -1 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  [next[from], next[to]] = [next[to]!, next[from]!];

  return next;
}
