import type { Db } from "@cage/db";
import type { JourneyView, LocationUpdate, StartedJourney, StartJourney } from "@cage/shared";
import type { CodeResult, JourneyObject, UpdateRefused } from "../journey-object";
import { journeysRepository } from "../repositories/journeys.repository";
import { travellerSettingsRepository } from "../repositories/traveller-settings.repository";
import { hashToken, newJourneyToken } from "../utils";
import { checkCode } from "./codes.service";

/** A journey can't start before the safe code exists: nothing could end it or answer a check-in. */
export type StartResult = StartedJourney | "no_codes";

/**
 * Journeys: the Durable Object holds the live state, timers and the journey
 * token's hash; D1 keeps a summary row that says whose journey it is.
 *
 * A journey is started, read, answered and ended with the traveller's
 * session. Location updates carry the journey token instead (ADR 0002), so a
 * journey never stops because a session expired.
 */
export function journeysService(db: Db, objects: DurableObjectNamespace<JourneyObject>, pepper: string) {
  const repo = journeysRepository(db);
  const settings = travellerSettingsRepository(db);
  const stub = (id: string) => objects.get(objects.idFromName(id));

  /** Which code the traveller entered: their safe code, their duress PIN or neither. */
  async function check(userId: string, code: string) {
    const row = await settings.find(userId);

    return checkCode(pepper, { safe: row?.safeCodeHash ?? null, duress: row?.duressCodeHash ?? null }, code);
  }

  /** The journey's object, or null when it doesn't exist or isn't this traveller's: both look the same to the caller. */
  async function owned(userId: string, id: string) {
    return (await repo.isOwnedBy(id, userId)) ? stub(id) : null;
  }

  return {
    async start(userId: string, input: StartJourney): Promise<StartResult> {
      const row = await settings.find(userId);

      if (!row?.safeCodeHash || !row.duressCodeHash) return "no_codes";

      const id = crypto.randomUUID();
      const journeyToken = newJourneyToken();

      // The D1 row goes first: the object's first alarm sends the circle their links and reads it.
      await repo.insert({
        id,
        userId,
        status: "active",
        destinationName: input.destination.name,
        expectedArrivalAt: new Date(input.expectedArrivalAt),
        startedAt: new Date(),
      });

      // The language saved in settings decides the circle's SMS and page, not what the app sent (older apps still send one).
      const journey = await stub(id).start(id, userId, { ...input, locale: row.locale }, await hashToken(journeyToken));

      if (!journey) throw new Error("journey id already in use");

      return { journey, journeyToken };
    },

    async update(id: string, journeyToken: string, update: LocationUpdate): Promise<JourneyView | UpdateRefused> {
      return stub(id).update(update, await hashToken(journeyToken));
    },

    async view(userId: string, id: string): Promise<JourneyView | null> {
      return (await owned(userId, id))?.view() ?? null;
    },

    /** The phone noticed something wrong and asks the traveller "are you safe?" (#23). */
    async requestCheckIn(userId: string, id: string): Promise<JourneyView | null> {
      return (await owned(userId, id))?.requestCheckIn() ?? null;
    },

    /** The traveller held SOS. No code: it must work for someone who can't speak or reach their phone for long. */
    async sos(userId: string, id: string): Promise<JourneyView | null> {
      return (await owned(userId, id))?.sos() ?? null;
    },

    /**
     * Answers a check-in with the safe code or the duress PIN. Both give the
     * same result to the caller; only the journey object acts on the
     * difference (ADR 0002).
     */
    async answer(userId: string, id: string, code: string): Promise<CodeResult> {
      const journey = await owned(userId, id);

      if (!journey) return "not_found";

      return journey.answer(await check(userId, code));
    },

    /** Ends the journey with the safe code. The duress PIN looks the same and alerts the circle. */
    async end(userId: string, id: string, code: string): Promise<CodeResult> {
      const journey = await owned(userId, id);

      if (!journey) return "not_found";

      return journey.end(await check(userId, code));
    },

    /**
     * True while any of the traveller's journeys has not ended. The Durable
     * Object has the live status; the D1 row only narrows down which to ask.
     */
    async hasOpen(userId: string): Promise<boolean> {
      // What the phone is shown, not the truth: after the duress PIN ends a trip, refusing a reset would give it away.
      const views = await Promise.all((await repo.notEndedIds(userId)).map((id) => stub(id).view()));

      return views.some((v) => v !== null && v.status !== "ended");
    },
  };
}
