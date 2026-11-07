import { z } from "zod";
import { Code } from "./codes";
import { AlertReason } from "./escalation";

export const LatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type LatLng = z.infer<typeof LatLng>;

/** What the phone sends when the user starts a journey (screen 01). */
export const StartJourney = z.object({
  destination: LatLng.extend({ name: z.string().min(1).max(200) }),
  /** Expected arrival, epoch milliseconds. */
  expectedArrivalAt: z.number().int().positive(),
  /** Lost contact can be turned on per trip, for risky journeys only. */
  lostContactEnabled: z.boolean().default(true),
  /**
   * Ignored by the server: the language saved in the traveller's settings
   * (`PUT /me/settings`) decides the language of their SMS, check-in call and
   * the circle's web view. Older apps still send it.
   */
  locale: z.enum(["vi", "en"]).default("vi"),
});

export type StartJourney = z.infer<typeof StartJourney>;

/** Sent every 30 to 60 seconds during a journey. Every update carries the battery level. */
export const LocationUpdate = LatLng.extend({
  accuracyM: z.number().nonnegative().optional(),
  /** Battery level from 0 to 1. */
  battery: z.number().min(0).max(1),
  /** When the phone took the reading, epoch milliseconds. */
  recordedAt: z.number().int().positive(),
});

export type LocationUpdate = z.infer<typeof LocationUpdate>;

export const JourneyStatus = z.enum([
  /** Travelling, updates arriving. */
  "active",
  /** Cage is asking "are you safe?" and waiting for the code. */
  "check_in",
  /** Updates stopped after arrival time plus the buffer. Circle only. */
  "lost_contact",
  /** The circle has been alerted and the escalation ladder is running. */
  "alerted",
  /** Ended with the safe code. Location data is deleted unless saved. */
  "ended",
]);

export type JourneyStatus = z.infer<typeof JourneyStatus>;

/** A journey as the API returns it. Never includes the circle's names. */
export const JourneyView = z.object({
  id: z.string(),
  status: JourneyStatus,
  destination: StartJourney.shape.destination,
  expectedArrivalAt: z.number(),
  locale: StartJourney.shape.locale,
  startedAt: z.number(),
  lastUpdate: LocationUpdate.nullable(),
  /** When the server will next look at this journey on its own. */
  nextDeadlineAt: z.number().nullable(),
  likelyBatteryDied: z.boolean(),
});

export type JourneyView = z.infer<typeof JourneyView>;

/**
 * What `POST /journeys` returns: the journey and its journey token (ADR 0002).
 * The app sends the token with every location update, so a journey never
 * stops because the session expired. It only works for this journey and
 * stops working when the journey ends.
 */
export const StartedJourney = z.object({
  journey: JourneyView,
  journeyToken: z.string(),
});

export type StartedJourney = z.infer<typeof StartedJourney>;

/** Body of `POST /journeys/:id/answer` and `POST /journeys/:id/end`: the safe code or the duress PIN. */
export const EnterCode = z.object({ code: Code });

export type EnterCode = z.infer<typeof EnterCode>;

/**
 * What a contact heard when they reached the traveller (screen 24a): "ok"
 * (fine, on the way) or "needs_help". Either way the alert stays on: only
 * the traveller's safe code ends it.
 */
export const ReachedOutcome = z.enum(["ok", "needs_help"]);

export type ReachedOutcome = z.infer<typeof ReachedOutcome>;

/** Body of `POST /links/:token/reached`. */
export const MarkReached = z.object({ outcome: ReachedOutcome });

export type MarkReached = z.infer<typeof MarkReached>;

/**
 * A journey as the safety circle sees it through their link (screens 22 to
 * 24b). Unlike the traveller's own view, it says when the duress PIN was used.
 */
export const CircleJourneyView = JourneyView.extend({
  /** The traveller's name, or their phone number if they never set one. */
  travellerName: z.string(),
  /** E.164, for the page's call and message buttons. The contact already has this number. */
  travellerPhone: z.string(),
  /** True on the hackathon demo server: the page marks itself DEMO and turns its call and message buttons off. */
  demo: z.boolean().default(false),
  /**
   * The traveller turned police on (settings, off by default). Only then does
   * the page offer Công an 113; Cage never calls police itself (PRD,
   * "Escalation ladder").
   */
  policeEnabled: z.boolean().default(false),
  alert: z
    .object({
      reason: AlertReason,
      raisedAt: z.number(),
      /**
       * "hotline" once nobody in the circle opened their link within
       * `TIMERS.circleOpenTimeoutMs`: the server resends the alert and the
       * page puts Tổng đài 111 first. It stays there once it has climbed.
       */
      step: z.enum(["circle", "hotline"]),
      /**
       * Contacts who reached the traveller since this alert, one note per
       * contact (the latest), oldest first. `name` is the contact as the
       * traveller saved them. Shown on every contact's page (24a).
       */
      reached: z.array(z.object({ name: z.string(), at: z.number(), outcome: ReachedOutcome })).default([]),
    })
    .nullable(),
});

export type CircleJourneyView = z.infer<typeof CircleJourneyView>;

/**
 * Hackathon demo (`DEMO_MODE` only): someone on a trip, for the dashboard's
 * "choose a traveller" step. Their own account, trip and circle, from the phone.
 */
export const DemoTraveller = z.object({
  journeyId: z.string(),
  /** The traveller's name, or their phone number if they never set one. */
  name: z.string(),
  destination: z.string(),
  status: JourneyStatus,
  startedAt: z.number(),
  circleSize: z.number(),
});

export type DemoTraveller = z.infer<typeof DemoTraveller>;

/**
 * Hackathon demo: the trip as the dashboard sees it. The circle's view (the
 * truth, duress included) plus what the traveller's own phone shows.
 */
export const DemoJourneyView = CircleJourneyView.extend({
  shownStatus: JourneyStatus,
  /** When the server last heard from the phone. */
  lastHeardAt: z.number(),
  /** The traveller's circle, in alert order. Numbers are masked: the dashboard is shown on stage. */
  circle: z.array(z.object({ name: z.string(), phone: z.string() })),
  /** True once the dashboard moves the traveller; the phone's own GPS is then ignored. */
  simulated: z.boolean(),
});

export type DemoJourneyView = z.infer<typeof DemoJourneyView>;

/** Body of `POST /demo/journeys/:id/move`: the dashboard's fake position. */
export const DemoMove = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  battery: z.number().min(0).max(1),
});

export type DemoMove = z.infer<typeof DemoMove>;

/** Hackathon demo: a message the demo would have sent, for the dashboard's log. Nothing is sent. */
export const DemoMessage = z.object({ to: z.string(), text: z.string(), sentAt: z.number() });

export type DemoMessage = z.infer<typeof DemoMessage>;
