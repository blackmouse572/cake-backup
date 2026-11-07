import type { Db } from "@cage/db";
import type { DemoJourneyView, DemoMessage, DemoMove, DemoTraveller, JourneyView } from "@cage/shared";
import { DEMO } from "../constants";
import type { JourneyObject } from "../journey-object";
import { circleContactsRepository } from "../repositories/circle-contacts.repository";
import { demoRepository } from "../repositories/demo.repository";
import { journeysRepository } from "../repositories/journeys.repository";
import { usersRepository } from "../repositories/users.repository";
import { displayName, maskPhone } from "../utils";

/**
 * The hackathon demo dashboard (`DEMO_MODE`). The traveller signs in on their
 * own phone and starts a real trip with their own circle; the dashboard picks
 * that trip and sets its states by journey id, with the demo key in place of
 * a session. Everything runs through the real journey object, and the demo
 * environment never sends a message (the routes check), it only logs them.
 */
export function demoService(
  db: Db,
  objects: DurableObjectNamespace<JourneyObject>,
  accounts: string[] | null,
) {
  const demo = demoRepository(db);
  const journeys = journeysRepository(db);
  const contacts = circleContactsRepository(db);
  const users = usersRepository(db);
  const stub = (id: string) => objects.get(objects.idFromName(id));

  const shown = (phone: string | null) => accounts === null || (phone !== null && accounts.includes(phone));

  /** The journey's row, when it exists and its traveller is on `DEMO_ACCOUNTS`. */
  async function demoJourney(id: string) {
    const row = await journeys.find(id);

    if (!row) return undefined;
    const account = await users.find(row.userId);

    return shown(account?.phoneNumber ?? null) ? row : undefined;
  }

  /** The journey's object, when the dashboard may drive it. */
  async function found(id: string) {
    return (await demoJourney(id)) ? stub(id) : null;
  }

  return {
    /** Everyone on a trip that started in the last `DEMO.listWindowMs`, newest first. */
    async travellers(now = Date.now()): Promise<DemoTraveller[]> {
      const rows = await demo.running(new Date(now - DEMO.listWindowMs));

      return rows.filter((r) => shown(r.phone)).map((r) => ({
        journeyId: r.journeyId,
        name: displayName(r.name, r.phone ?? ""),
        destination: r.destination,
        status: r.status,
        startedAt: r.startedAt.getTime(),
        circleSize: r.circleSize,
      }));
    },

    async view(id: string, now = Date.now()): Promise<DemoJourneyView | null> {
      const row = await demoJourney(id);
      const view = row ? await stub(id).demoView(now) : null;

      if (!row || !view) return null;
      const [account, circle] = await Promise.all([users.find(row.userId), contacts.list(row.userId)]);
      const phone = account?.phoneNumber ?? "";

      return {
        ...view,
        travellerName: displayName(account?.name ?? "", phone),
        travellerPhone: phone,
        demo: true,
        circle: circle.map((c) => ({ name: c.name, phone: maskPhone(c.phone) })),
      };
    },

    /** Off route: the phone asks "are you safe?". */
    async requestCheckIn(id: string): Promise<JourneyView | null> {
      return (await (await found(id))?.requestCheckIn()) ?? null;
    },

    /** The next timer fires now: no answer to a check-in alerts the circle. */
    async skipToDeadline(id: string): Promise<boolean> {
      const journey = await found(id);

      if (!journey) return false;
      await journey.skipToDeadline();

      return true;
    },

    /** The phone goes quiet: the circle is told contact is lost. */
    async loseContact(id: string): Promise<boolean> {
      const journey = await found(id);

      if (!journey) return false;
      await journey.loseContact();

      return true;
    },

    /** Puts the traveller on the dashboard's fake route. */
    async move(id: string, move: DemoMove, now = Date.now()): Promise<boolean> {
      const journey = await found(id);

      return journey ? journey.simulate({ ...move, recordedAt: now }, now) : false;
    },

    /** The messages the demo would have sent, oldest first, by the contact's name. */
    async log(id: string): Promise<DemoMessage[] | null> {
      const row = await demoJourney(id);

      if (!row) return null;
      const [messages, circle] = await Promise.all([demo.messages(id), contacts.list(row.userId)]);
      const names = new Map(circle.map((c) => [c.phone, c.name]));

      return messages.map((m) => ({ to: names.get(m.to) ?? m.to, text: m.text, sentAt: m.createdAt.getTime() }));
    },

    /** "Start again": deletes the trip. The traveller's account and circle stay. */
    async remove(id: string): Promise<boolean> {
      if (!(await demoJourney(id))) return false;
      await stub(id).forget();
      await demo.deleteJourney(id);

      return true;
    },
  };
}
