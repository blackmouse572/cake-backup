import { createDb } from "@cage/db";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { circleMessagesService } from "../src/services/circle-messages.service";
import type { MessageSender, Outgoing } from "../src/types";
import { api, newNumber, send, signIn } from "./helpers";

/** A sender that keeps what it was given. `fail` makes it refuse (or throw for) the numbers listed. */
function recordingSender(fail: { refuse?: string[]; throwFor?: string[] } = {}) {
  const sent: Outgoing[] = [];

  const sender: MessageSender = {
    async send(outgoing) {
      if (fail.throwFor?.includes(outgoing.to)) throw new Error("provider down");

      if (fail.refuse?.includes(outgoing.to)) return "not_sent";
      sent.push(outgoing);

      return "sent";
    },
  };

  return { sender, sent };
}

/** A traveller with a name and the language set to English, and no circle yet. */
async function traveller(): Promise<{ cookie: string; userId: string }> {
  const { cookie, phoneNumber } = await signIn();
  expect((await send("/me/name", "PUT", { name: "Lan" }, { cookie })).status).toBe(204);

  const settings = await api("/me/settings", {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ locale: "en" }),
  });

  expect(settings.status).toBe(204);
  const row = await env.DB.prepare("select id from user where phone_number = ?").bind(phoneNumber).first<{ id: string }>();

  return { cookie, userId: row!.id };
}

/** The same traveller with these contacts in their circle, in this order. Returns their user id. */
async function travellerWith(phones: string[]): Promise<string> {
  const { cookie, userId } = await traveller();
  const contacts = phones.map((phone, i) => ({ name: `Contact ${i}`, phone }));

  const res = await api("/circle", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ contacts }),
  });

  expect(res.status).toBe(201);

  return userId;
}

const service = (sender: MessageSender) => circleMessagesService(createDb(env.DB), sender, "https://cage.test");

describe("telling the circle the codes were reset", () => {
  it("sends one message to every contact, in the traveller's language", async () => {
    const phones = [newNumber(), newNumber()];
    const userId = await travellerWith(phones);
    const { sender, sent } = recordingSender();

    expect(await service(sender).codesReset(userId)).toBe(2);
    expect(sent.map((o) => o.to)).toEqual(phones);

    for (const outgoing of sent) {
      expect(outgoing.locale).toBe("en");
      expect(outgoing.message).toEqual({ kind: "codes_reset", name: "Lan" });
    }
  });

  it("still tells the other contacts when one message fails", async () => {
    const phones = [newNumber(), newNumber(), newNumber()];
    const userId = await travellerWith(phones);
    const { sender, sent } = recordingSender({ throwFor: [phones[0]!], refuse: [phones[1]!] });

    expect(await service(sender).codesReset(userId)).toBe(1);
    expect(sent.map((o) => o.to)).toEqual([phones[2]]);
  });

  it("sends nothing to an empty circle", async () => {
    const { userId } = await traveller();
    const { sender, sent } = recordingSender();

    expect(await service(sender).codesReset(userId)).toBe(0);
    expect(sent).toEqual([]);
  });
});
