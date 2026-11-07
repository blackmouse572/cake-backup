import type { Db } from "@cage/db";
import { CIRCLE, toE164, type Circle, type NewCircleContact } from "@cage/shared";
import { circleContactsRepository, type CircleContactRow } from "../repositories/circle-contacts.repository";
import { usersRepository } from "../repositories/users.repository";

export type AddContactsResult = Circle | "invalid_phone" | "own_number" | "circle_full";

export type RemoveContactResult = "ok" | "not_found";

export type ReorderResult = Circle | "order_mismatch";

const toContact = ({ id, name, phone }: CircleContactRow) => ({ id, name, phone });

/**
 * The safety circle of one traveller. Contacts have no account (ADR 0002);
 * their phone numbers are stored in E.164 so the senders and the journey
 * links (#18) see one form.
 */
export function circleService(db: Db) {
  const contacts = circleContactsRepository(db);
  const users = usersRepository(db);

  const list = async (userId: string): Promise<Circle> => (await contacts.list(userId)).map(toContact);

  return {
    list,

    /**
     * Adds contacts after the existing ones, in the order given. A number
     * already in the circle (or twice in the request) is skipped, so picking
     * the same person again is harmless. Every number must be valid and none
     * may be the traveller's own, or nothing is added.
     */
    async add(userId: string, input: readonly NewCircleContact[]): Promise<AddContactsResult> {
      const normalised = input.map((c) => ({ name: c.name, phone: toE164(c.phone) }));

      if (normalised.some((c) => c.phone === null)) return "invalid_phone";
      const [account, existing] = await Promise.all([users.find(userId), contacts.list(userId)]);

      if (normalised.some((c) => c.phone === account?.phoneNumber)) return "own_number";
      const seen = new Set(existing.map((c) => c.phone));
      const fresh: { name: string; phone: string }[] = [];

      for (const c of normalised) {
        if (c.phone === null || seen.has(c.phone)) continue;
        seen.add(c.phone);
        fresh.push({ name: c.name, phone: c.phone });
      }

      if (existing.length + fresh.length > CIRCLE.max) return "circle_full";
      const next = Math.max(-1, ...existing.map((c) => c.position)) + 1;

      if (fresh.length > 0) {
        await contacts.insertMany(
          fresh.map((c, i) => ({ id: crypto.randomUUID(), userId, name: c.name, phone: c.phone, position: next + i })),
        );
      }

      return list(userId);
    },

    /**
     * Removes a contact. This is also what revokes their journey links: a
     * link names the contact's id, and `isMember` stops matching it here.
     */
    async remove(userId: string, id: string): Promise<RemoveContactResult> {
      return (await contacts.delete(userId, id)) ? "ok" : "not_found";
    },

    /** Sets the alert order. `ids` must name every contact exactly once. */
    async reorder(userId: string, ids: readonly string[]): Promise<ReorderResult> {
      const existing = await contacts.list(userId);
      const current = new Set(existing.map((c) => c.id));
      const sameSet = ids.length === current.size && new Set(ids).size === ids.length && ids.every((id) => current.has(id));

      if (!sameSet) return "order_mismatch";
      await contacts.setOrder(userId, ids);

      return list(userId);
    },

    /**
     * True while the contact is still in this traveller's circle. Journey
     * links (#18) call this on every open, so removing a contact cuts off
     * their links at once.
     */
    async isMember(userId: string, contactId: string): Promise<boolean> {
      return (await contacts.find(userId, contactId)) !== undefined;
    },
  };
}
