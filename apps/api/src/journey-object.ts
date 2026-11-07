import { createDb } from "@cage/db";
import {
  alertStep,
  arrivalDeadline,
  atArrivalDeadline,
  checkInDeadline,
  likelyBatteryDied,
  TIMERS,
  type AlertReason,
  type CircleJourneyView,
  type DemoJourneyView,
  type CodeCheck,
  type JourneyStatus,
  type JourneyView,
  type LocationUpdate,
  type StartJourney,
} from "@cage/shared";
import { DurableObject } from "cloudflare:workers";
import type { Bindings } from "./bindings";
import { JOURNEY_CODES } from "./constants";
import { messageSenderFor } from "./message-sender";
import { logError } from "./middleware/request-log";
import { loggingSender } from "./senders/dev.sender";
import { circleLinksRepository } from "./repositories/circle-links.repository";
import { journeysRepository } from "./repositories/journeys.repository";
import { circleMessagesService, type CircleNotice } from "./services/circle-messages.service";
import { sameString } from "./utils";

interface Alert {
  reason: AlertReason;
  raisedAt: number;
  /** When someone in the circle first opened a link after the alert. */
  openedAt: number | null;
}

interface JourneyState {
  id: string;
  userId: string;
  status: JourneyStatus;
  /**
   * What the traveller's own phone is shown. It differs from `status` only
   * after the duress PIN: the phone then shows "safe" or "ended" while the
   * circle sees the alert.
   */
  shownStatus: JourneyStatus;
  destination: StartJourney["destination"];
  expectedArrivalAt: number;
  lostContactEnabled: boolean;
  locale: StartJourney["locale"];
  startedAt: number;
  /** When the server last heard from the phone (server clock). */
  lastHeardAt: number;
  lastUpdate: LocationUpdate | null;
  /** SHA-256 of the journey token. The token itself is never stored. */
  tokenHash: string;
  /** When the server next looks at this journey on its own, or null. */
  deadlineAt: number | null;
  alert: Alert | null;
  /** Wrong codes on check-ins and at the end, until `JOURNEY_CODES.lockMs` passes without one. */
  wrongCodes: number;
  /** When the last wrong code was entered. Missing on journeys started before the lock. */
  wrongCodeAt?: number | null;
  /**
   * Messages for the circle, sent from the alarm rather than inside the
   * request, so the duress PIN answers exactly as fast as the safe code.
   */
  outbox: CircleNotice[];
  /** The status last written to the journey's D1 row. */
  syncedStatus: JourneyStatus;
  /** Demo only: the dashboard moves the traveller, so the phone's own positions are ignored. */
  simulated?: boolean;
}

/** An update from a phone without this journey's live token. */
export type UpdateRefused = "unauthorized";

/** What entering a code did. "ok" covers the safe code and the duress PIN alike. */
export type CodeResult = "ok" | "wrong_code" | "too_many_tries" | "not_found";

const STATE = "state";

/**
 * One instance per journey. It keeps the live journey in its own storage and
 * its alarm runs the journey's timers and sends the circle's messages, so
 * they happen whether or not the phone is reachable.
 */
export class JourneyObject extends DurableObject<Bindings> {
  /** Returns null if this id already holds a journey; ids are random, so that means a bug, not a retry. */
  async start(
    id: string,
    userId: string,
    input: StartJourney,
    tokenHash: string,
    now = Date.now(),
  ): Promise<JourneyView | null> {
    if (await this.load()) return null;

    const state: JourneyState = {
      id,
      userId,
      status: "active",
      shownStatus: "active",
      destination: input.destination,
      expectedArrivalAt: input.expectedArrivalAt,
      lostContactEnabled: input.lostContactEnabled,
      locale: input.locale,
      startedAt: now,
      lastHeardAt: now,
      lastUpdate: null,
      tokenHash,
      deadlineAt: arrivalDeadline(input.expectedArrivalAt),
      alert: null,
      wrongCodes: 0,
      wrongCodeAt: null,
      syncedStatus: "active",
      outbox: [
        { kind: "journey_started", destination: input.destination.name, arriveAt: input.expectedArrivalAt },
      ],
    };

    await this.save(state);

    return travellerView(state);
  }

  /**
   * Takes an update only with this journey's token, and only while the
   * journey runs: the token dies when the journey ends. An unknown journey
   * gets the same answer as a wrong token, so a token can't probe for ids.
   */
  async update(update: LocationUpdate, tokenHash: string, now = Date.now()): Promise<JourneyView | UpdateRefused> {
    const state = await this.load();

    if (!state || state.status === "ended" || !sameString(state.tokenHash, tokenHash)) return "unauthorized";

    state.lastHeardAt = now;

    if (!state.simulated) state.lastUpdate = update;
    await this.ctx.storage.put(STATE, state);

    return travellerView(state);
  }

  /** The journey as the traveller's phone sees it. */
  async view(): Promise<JourneyView | null> {
    const state = await this.load();

    return state ? travellerView(state) : null;
  }

  /** The journey as the circle sees it, without the traveller's name (D1 has that). */
  async circleView(now = Date.now()): Promise<Omit<CircleJourneyView, "travellerName" | "travellerPhone" | "demo"> | null> {
    const state = await this.load();

    if (!state) return null;

    return {
      ...travellerView(state),
      status: state.status,
      alert: state.alert
        ? { reason: state.alert.reason, raisedAt: state.alert.raisedAt, step: alertStep(state.alert, now) }
        : null,
    };
  }

  /** Someone in the circle opened their link. Counts for the 10-minute rule once an alert is out. */
  async markOpened(now = Date.now()): Promise<void> {
    const state = await this.load();

    if (!state?.alert || state.alert.openedAt !== null) return;
    state.alert.openedAt = now;
    await this.ctx.storage.put(STATE, state);
  }

  /**
   * The phone saw something wrong (off route, stopped too long; #23) and
   * asks "are you safe?". The server takes over the timer from here.
   */
  async requestCheckIn(now = Date.now()): Promise<JourneyView | null> {
    const state = await this.load();

    if (!state) return null;

    if (state.status === "active") {
      state.status = "check_in";
      state.shownStatus = "check_in";
      state.deadlineAt = checkInDeadline(now);
      await this.save(state);
    }

    return travellerView(state);
  }

  /**
   * The traveller held SOS: alerts the circle now, with no code. Lost contact
   * only ever told the circle calmly, so an SOS raises it; any other alert
   * stays as it is and the circle is not told twice.
   */
  async sos(now = Date.now()): Promise<JourneyView | null> {
    const state = await this.load();

    if (!state || state.status === "ended") return null;

    if (state.alert?.reason === "lost_contact") state.alert = null;
    this.raiseAlert(state, "sos", now);
    await this.save(state);

    return travellerView(state);
  }

  /**
   * Answers a check-in. The safe code clears any check-in or alert and the
   * journey carries on; the duress PIN looks the same on the phone but
   * alerts the circle. Too many wrong codes count as no answer, and lock out
   * every code for a while.
   */
  async answer(check: CodeCheck, now = Date.now()): Promise<CodeResult> {
    const state = await this.load();

    if (!state || state.status === "ended") return "not_found";

    if (lockedOut(state, now)) return "too_many_tries";

    if (check === "wrong") return this.wrongCode(state, now);

    const nextDeadline = Math.max(arrivalDeadline(state.expectedArrivalAt), now + TIMERS.arrivalBufferMs);
    state.wrongCodes = 0;
    state.deadlineAt = nextDeadline;
    state.shownStatus = "active";

    if (check === "duress") {
      this.raiseAlert(state, "duress", now);
    } else {
      if (state.alert) state.outbox.push({ kind: "safe_now" });
      state.alert = null;
      state.status = "active";
    }

    await this.save(state);

    return "ok";
  }

  /**
   * Ends the journey. The safe code ends it and drops its location; the
   * duress PIN shows "ended" on the phone but alerts the circle and keeps
   * the journey open for them.
   */
  async end(check: CodeCheck, now = Date.now()): Promise<CodeResult> {
    const state = await this.load();

    if (!state || state.status === "ended") return "not_found";

    if (lockedOut(state, now)) return "too_many_tries";

    if (check === "wrong") return this.wrongCode(state, now);

    state.wrongCodes = 0;
    state.shownStatus = "ended";
    state.deadlineAt = null;

    if (check === "duress") {
      this.raiseAlert(state, "duress", now);
    } else {
      if (state.alert) state.outbox.push({ kind: "safe_now" });
      state.status = "ended";
      state.alert = null;
      // Location data is deleted when a journey ends (PRD, privacy). Saving to the journal comes with #32.
      state.lastUpdate = null;
    }

    await this.save(state);

    return "ok";
  }

  /** Demo only: the next timer fires now instead of in 20 minutes. */
  async skipToDeadline(): Promise<void> {
    const state = await this.load();

    if (!state || state.deadlineAt === null) return;
    state.deadlineAt = Date.now();
    await this.save(state);
  }

  /** Demo only: the trip as the dashboard sees it, the truth and what the phone shows. */
  async demoView(now = Date.now()): Promise<Omit<DemoJourneyView, "travellerName" | "travellerPhone" | "circle" | "demo"> | null> {
    const view = await this.circleView(now);
    const state = await this.load();

    return view && state
      ? { ...view, shownStatus: state.shownStatus, lastHeardAt: state.lastHeardAt, simulated: state.simulated ?? false }
      : null;
  }

  /** Demo only: the dashboard puts the traveller here. From now on the phone's GPS is ignored. */
  async simulate(update: LocationUpdate, now = Date.now()): Promise<boolean> {
    const state = await this.load();

    if (!state || state.status === "ended") return false;
    state.lastUpdate = update;
    state.lastHeardAt = now;
    state.simulated = true;
    await this.ctx.storage.put(STATE, state);

    return true;
  }

  /** Demo only: deletes everything this journey holds, for "start again" and expiry. */
  async forget(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  /** Demo only: contact is lost now, as if the phone had gone quiet past the arrival deadline. */
  async loseContact(now = Date.now()): Promise<void> {
    const state = await this.load();

    if (!state || state.status === "ended" || !state.lostContactEnabled) return;
    this.raiseAlert(state, "lost_contact", now);
    await this.save(state);
  }

  override async alarm(): Promise<void> {
    const state = await this.load();

    if (!state) return;
    const now = Date.now();

    if (state.deadlineAt !== null && now >= state.deadlineAt) {
      state.deadlineAt = null;
      this.onDeadline(state, now);
    }

    const outbox = state.outbox;
    const statusChanged = state.syncedStatus !== state.status;
    state.outbox = [];
    state.syncedStatus = state.status;

    // Saved before sending, so a crash mid-send never sends the same notice twice.
    await this.save(state);
    await this.deliver(state, outbox, statusChanged);
  }

  private onDeadline(state: JourneyState, now: number): void {
    if (state.status === "check_in") {
      this.raiseAlert(state, "no_answer", now);

      return;
    }

    if (state.status !== "active") return;

    const next = atArrivalDeadline({
      now,
      status: state.status,
      lostContactEnabled: state.lostContactEnabled,
      lastHeardAt: state.lastHeardAt,
    });

    if (next === "lost_contact") {
      this.raiseAlert(state, "lost_contact", now);
    } else if (next === "check_in") {
      state.status = "check_in";
      state.shownStatus = "check_in";
      state.deadlineAt = checkInDeadline(now);
    }
  }

  /**
   * Alerts the circle once per journey. Lost contact stays "lost contact"
   * (circle only, PRD); every other reason is an alert. The phone is told,
   * except after the duress PIN.
   */
  private raiseAlert(state: JourneyState, reason: AlertReason, now: number): void {
    if (state.alert) return;
    state.alert = { reason, raisedAt: now, openedAt: null };
    state.status = reason === "lost_contact" ? "lost_contact" : "alerted";

    if (reason !== "duress") {
      state.shownStatus = state.status;
      state.deadlineAt = null;
    }

    // A phone that died at low battery gets a calm "phone probably died" message (PRD, "Lost contact").
    state.outbox.push({
      kind: "alert",
      reason,
      likelyBatteryDied: reason === "lost_contact" ? likelyBatteryDied(state.lastUpdate) : undefined,
    });
  }

  private async wrongCode(state: JourneyState, now: number): Promise<CodeResult> {
    // An old run of wrong codes no longer counts once the lock time has passed without one.
    const recent = now - (state.wrongCodeAt ?? 0) < JOURNEY_CODES.lockMs;
    state.wrongCodes = (recent ? state.wrongCodes : 0) + 1;
    state.wrongCodeAt = now;

    // Someone guessing at the code during a check-in is no answer.
    if (state.wrongCodes >= JOURNEY_CODES.wrongTries && state.status === "check_in") {
      this.raiseAlert(state, "no_answer", now);
    }

    await this.save(state);

    return state.wrongCodes >= JOURNEY_CODES.wrongTries ? "too_many_tries" : "wrong_code";
  }

  /** Sends what the alarm took from the outbox and mirrors the status to D1. */
  private async deliver(state: JourneyState, outbox: CircleNotice[], statusChanged: boolean): Promise<void> {
    const db = createDb(this.env.DB);
    const journey = { id: state.id, userId: state.userId, locale: state.locale };

    try {
      if (statusChanged) {
        await journeysRepository(db).setStatus(state.id, state.status, state.status === "ended" ? new Date() : undefined);
      }

      if (outbox.length > 0) {
        const sender = messageSenderFor(this.env, db);

        // The demo sends nothing; it keeps each message for the dashboard's log instead.
        const circle = circleMessagesService(
          db,
          this.env.DEMO_MODE === "on" ? loggingSender(sender, db, state.id) : sender,
          this.env.CIRCLE_WEB_URL,
        );

        for (const notice of outbox) await circle.send(journey, notice);
      }

      // Links already stop working with the journey; this clears their rows. Last, because sending adds links.
      if (state.status === "ended") await circleLinksRepository(db).deleteForJourney(state.id);
    } catch (err) {
      logError(err instanceof Error ? err : new Error(String(err)), "journey-object.alarm");
    }
  }

  private async load(): Promise<JourneyState | undefined> {
    return this.ctx.storage.get<JourneyState>(STATE);
  }

  /** Stores the state and points the alarm at the next thing to do: the outbox now, or the next deadline. */
  private async save(state: JourneyState): Promise<void> {
    await this.ctx.storage.put(STATE, state);
    const pending = state.outbox.length > 0 || state.syncedStatus !== state.status;
    const next = pending ? Date.now() : state.deadlineAt;

    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }
}

/**
 * True while too many wrong codes were entered too recently. The caller
 * refuses every code then, the safe code and the duress PIN included, so
 * guessing can't stop at the first code that works.
 */
function lockedOut(state: JourneyState, now: number): boolean {
  return state.wrongCodes >= JOURNEY_CODES.wrongTries && now - (state.wrongCodeAt ?? 0) < JOURNEY_CODES.lockMs;
}

function travellerView(state: JourneyState): JourneyView {
  return {
    id: state.id,
    status: state.shownStatus,
    destination: state.destination,
    expectedArrivalAt: state.expectedArrivalAt,
    locale: state.locale,
    startedAt: state.startedAt,
    lastUpdate: state.lastUpdate,
    nextDeadlineAt: state.deadlineAt,
    likelyBatteryDied: likelyBatteryDied(state.lastUpdate),
  };
}
