import { createDb } from "@cage/db";
import {
  alertStep,
  arrivalDeadline,
  atArrivalDeadline,
  checkInDeadline,
  likelyBatteryDied,
  outranks,
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
  /** "hotline" once the ladder climbed. Missing on alerts raised before the ladder ran on the server. */
  step?: "circle" | "hotline";
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
  /**
   * When the alert climbs to the hotline if nobody in the circle has opened
   * their link by then (`TIMERS.circleOpenTimeoutMs`), or null. Missing on
   * journeys started before the ladder ran on the server.
   */
  ladderAt?: number | null;
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
      ladderAt: null,
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
   * An update after lost contact means the phone is back (#23).
   */
  async update(update: LocationUpdate, tokenHash: string, now = Date.now()): Promise<JourneyView | UpdateRefused> {
    const state = await this.load();

    if (!state || state.status === "ended" || !sameString(state.tokenHash, tokenHash)) return "unauthorized";

    state.lastHeardAt = now;

    if (!state.simulated) state.lastUpdate = update;

    // On the demo the dashboard drives the traveller, so the phone's own updates never bring it back.
    if (state.shownStatus === "lost_contact" && !state.simulated) {
      this.backOnline(state, now);
      await this.save(state);
    } else {
      await this.ctx.storage.put(STATE, state);
    }

    return travellerView(state);
  }

  /** The journey as the traveller's phone sees it. */
  async view(): Promise<JourneyView | null> {
    const state = await this.load();

    return state ? travellerView(state) : null;
  }

  /** The journey as the circle sees it, without the traveller's name (D1 has that). */
  async circleView(now = Date.now()): Promise<Omit<CircleJourneyView, "travellerName" | "travellerPhone" | "demo" | "policeEnabled"> | null> {
    const state = await this.load();

    if (!state) return null;

    return {
      ...travellerView(state),
      status: state.status,
      alert: state.alert
        ? {
            reason: state.alert.reason,
            raisedAt: state.alert.raisedAt,
            // Once climbed, it stays; until the alarm runs, the clock already says where it is.
            step: state.alert.step === "hotline" ? "hotline" : alertStep(state.alert, now),
          }
        : null,
    };
  }

  /** Someone in the circle opened their link. Once an alert is out, that stops the climb to the hotline. */
  async markOpened(now = Date.now()): Promise<void> {
    const state = await this.load();

    if (!state?.alert || state.alert.openedAt !== null) return;
    state.alert.openedAt = now;
    state.ladderAt = null;
    await this.save(state);
  }

  /**
   * The duress PIN was entered somewhere other than this journey's own
   * screens (changing the codes, signing out). The phone shows nothing; the
   * circle is alerted.
   */
  async duress(now = Date.now()): Promise<void> {
    const state = await this.load();

    if (!state || state.status === "ended") return;
    this.raiseAlert(state, "duress", now);
    await this.save(state);
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
    } else if (hiddenDuress(state) && state.shownStatus === "active") {
      // The circle is already alerted; the phone gets the check-in it would get after the safe code.
      state.shownStatus = "check_in";
      state.deadlineAt = checkInDeadline(now);
      await this.save(state);
    }

    return travellerView(state);
  }

  /**
   * The traveller held SOS: alerts the circle now, with no code. Lost contact
   * only ever told the circle calmly, so an SOS outranks it; any other alert
   * stays as it is and the circle is not told twice (`outranks`).
   */
  async sos(now = Date.now()): Promise<JourneyView | null> {
    const state = await this.load();

    if (!state || state.status === "ended") return null;

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
      state.ladderAt = null;
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
      state.ladderAt = null;
      // Location data is deleted when a journey ends (PRD, privacy). Saving to the journal comes with #32.
      state.lastUpdate = null;
    }

    await this.save(state);

    return "ok";
  }

  /** Demo only: the next timer (a deadline or the climb to the hotline) fires now instead of in 20 or 10 minutes. */
  async skipToDeadline(): Promise<void> {
    const state = await this.load();
    const next = state ? nextTimer(state) : null;

    if (!state || next === null) return;

    if (next === state.deadlineAt) state.deadlineAt = Date.now();
    else state.ladderAt = Date.now();
    await this.save(state);
  }

  /** Demo only: the trip as the dashboard sees it, the truth and what the phone shows. */
  async demoView(now = Date.now()): Promise<Omit<DemoJourneyView, "travellerName" | "travellerPhone" | "circle" | "demo" | "policeEnabled"> | null> {
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

    if (state.ladderAt != null && now >= state.ladderAt) {
      state.ladderAt = null;
      this.climb(state);
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
    if (hiddenDuress(state)) {
      this.phoneDeadline(state, now);

      return;
    }

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
   * A deadline after a hidden duress PIN. The circle is already alerted and
   * hears nothing new; the phone moves on exactly as it would after the
   * safe code, so nobody watching it can tell (#50): a check-in at the
   * arrival deadline (or lost contact if it went quiet), then the alert
   * screen if that check-in goes unanswered.
   */
  private phoneDeadline(state: JourneyState, now: number): void {
    if (state.shownStatus === "check_in") {
      state.shownStatus = "alerted";

      return;
    }

    if (state.shownStatus !== "active") return;

    const next = atArrivalDeadline({
      now,
      status: "active",
      lostContactEnabled: state.lostContactEnabled,
      lastHeardAt: state.lastHeardAt,
    });

    state.shownStatus = next === "lost_contact" ? "lost_contact" : "check_in";
    state.deadlineAt = next === "lost_contact" ? null : checkInDeadline(now);
  }

  /**
   * The phone is heard from again after it showed lost contact (screen 16):
   * it goes back to active and the server checks in once the buffer passes
   * again, since the traveller is late. If the journey really is in lost
   * contact, the alert ends and the circle is told. A duress PIN entered
   * meanwhile (changing codes, signing out) keeps its alert, but the phone
   * looks exactly as it would after the safe code.
   */
  private backOnline(state: JourneyState, now: number): void {
    state.shownStatus = "active";
    state.deadlineAt = Math.max(arrivalDeadline(state.expectedArrivalAt), now + TIMERS.arrivalBufferMs);

    if (state.status !== "lost_contact") return;
    state.status = "active";
    state.alert = null;
    state.ladderAt = null;

    // A lost-contact alert not sent yet is dropped instead: the circle never heard, so there is nothing to undo.
    const unsent = state.outbox.some((notice) => notice.kind === "alert");
    state.outbox = state.outbox.filter((notice) => notice.kind !== "alert");

    if (!unsent) state.outbox.push({ kind: "back_online" });
  }

  /**
   * Nobody in the circle opened their link within 10 minutes: resend the
   * alert to everyone and move to the hotline step, where the circle's page
   * puts Tổng đài 111 and Blue Dragon first (#18). Nobody is called
   * automatically; police are never more than a number on the page.
   */
  private climb(state: JourneyState): void {
    const alert = state.alert;

    if (!alert || alert.openedAt !== null || alert.step === "hotline") return;
    alert.step = "hotline";

    state.outbox.push({
      kind: "alert",
      reason: alert.reason,
      step: "hotline",
      likelyBatteryDied: alert.reason === "lost_contact" ? likelyBatteryDied(state.lastUpdate) : undefined,
    });
  }

  /**
   * Alerts the circle. Lost contact stays "lost contact" (circle only, PRD);
   * every other reason is an alert and starts the 10-minute climb to the
   * hotline. An alert already out is replaced only by a stronger reason (the
   * duress PIN after a missed check-in), which starts over at the circle
   * unless the ladder already climbed. The phone is told, except after the
   * duress PIN.
   */
  private raiseAlert(state: JourneyState, reason: AlertReason, now: number): void {
    if (state.alert && !outranks(reason, state.alert.reason)) return;
    const climbed = state.alert?.step === "hotline";
    state.alert = { reason, raisedAt: now, openedAt: null, step: climbed ? "hotline" : "circle" };
    state.status = reason === "lost_contact" ? "lost_contact" : "alerted";
    state.ladderAt = reason === "lost_contact" || climbed ? null : now + TIMERS.circleOpenTimeoutMs;
    // An alert not sent yet is replaced, so the circle hears only the strongest one, and never "safe now" for it.
    const unsent = state.outbox.findIndex((notice) => notice.kind === "alert");

    if (unsent !== -1) {
      state.outbox = [
        ...state.outbox.slice(0, unsent),
        ...state.outbox.slice(unsent).filter((notice) => notice.kind !== "alert" && notice.kind !== "safe_now"),
      ];
    }

    if (reason !== "duress") {
      state.shownStatus = state.status;
      state.deadlineAt = null;
    }

    // A phone that died at low battery gets a calm "phone probably died" message (PRD, "Lost contact").
    state.outbox.push({
      kind: "alert",
      reason,
      step: state.alert.step,
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

  /** Stores the state and points the alarm at the next thing to do: the outbox now, or the next timer. */
  private async save(state: JourneyState): Promise<void> {
    await this.ctx.storage.put(STATE, state);
    const pending = state.outbox.length > 0 || state.syncedStatus !== state.status;
    const next = pending ? Date.now() : nextTimer(state);

    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }
}

/**
 * The duress PIN raised the alert and the phone was told nothing: it still
 * shows the trip going on (or its own check-in), while the circle sees the
 * alert.
 */
function hiddenDuress(state: JourneyState): boolean {
  return state.status === "alerted" && state.alert?.reason === "duress" && state.shownStatus !== "alerted" && state.shownStatus !== "ended";
}

/** The journey's next timer: its deadline or the alert's climb to the hotline, whichever comes first. */
function nextTimer(state: JourneyState): number | null {
  const timers = [state.deadlineAt, state.ladderAt ?? null].filter((t): t is number => t !== null);

  return timers.length > 0 ? Math.min(...timers) : null;
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
