import type { Locale } from "@cage/i18n";
import type { AlertReason, LatLng, Place, PlaceSuggestion, Route, RouteRequest } from "@cage/shared";
import type { Bindings } from "./bindings";

/** Hono env for every route. */
export type AppEnv = { Bindings: Bindings };

/** Hono env behind `requireSession`: the signed-in traveller's id and when the session was created (ms). */
export type AuthedEnv = { Bindings: Bindings; Variables: { userId: string; sessionCreatedAt: number } };

/** Hono env behind `requireJourneyToken`: the token from the request is set, not yet checked. */
export type JourneyTokenEnv = { Bindings: Bindings; Variables: { journeyToken: string } };

// --- Messages --------------------------------------------------------------

/** How a message reaches a phone: Zalo ZNS first (cheaper), SMS as the fallback (ADR 0001, 0002). */
export type Channel = "zalo" | "sms";

/**
 * What we send. Sign-in codes go to the traveller; the rest go to their
 * safety circle, each with that contact's own link (#18).
 */
export type Message =
  | { kind: "code"; code: string }
  | { kind: "journey_started"; name: string; destination: string; arriveAt: number; url: string }
  /** `likelyBatteryDied` changes only the lost-contact message: the last update had a nearly empty battery. */
  | { kind: "alert"; reason: AlertReason; name: string; url: string; likelyBatteryDied?: boolean }
  | { kind: "safe_now"; name: string }
  /** The phone is heard from again after lost contact (#23, screen 16). */
  | { kind: "back_online"; name: string; url: string }
  /** The traveller reset both codes with "Quên mã?" (#35). Never says which code or the new ones. */
  | { kind: "codes_reset"; name: string };

export type MessageKind = Message["kind"];

/** One message to one phone, in the traveller's language (ADR 0003). */
export type Outgoing = {
  /** E.164, e.g. +84912345678. */
  to: string;
  locale: Locale;
  message: Message;
  /** Try this channel first, e.g. when the traveller tapped "No Zalo? Send by SMS". */
  prefer?: Channel;
};

/**
 * What one channel did with a message. `skipped` means it never tried (no
 * template for the language, a number it can't reach); `failed` means the
 * provider refused or didn't answer. `reason` is a short code, never a body
 * or a phone number, because it goes to the logs.
 */
export type ChannelResult =
  | { status: "sent"; providerId: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/** One provider behind one channel. */
export interface ChannelSender {
  readonly channel: Channel;
  send(outgoing: Outgoing): Promise<ChannelResult>;
}

/** Sends a message on the first channel that takes it. */
export interface MessageSender {
  send(outgoing: Outgoing): Promise<"sent" | "not_sent">;
}

/** One line in the delivery log. No message bodies and no phone numbers. */
export type DeliveryLogEntry = {
  event: "message_delivery";
  kind: MessageKind;
  channel: Channel;
  locale: Locale;
} & ChannelResult;

/** The `fetch` a provider calls, passed in so tests can answer for the provider. */
export type Fetch = (input: Request | string, init?: RequestInit) => Promise<Response>;

// --- Maps ------------------------------------------------------------------

/**
 * A provider of place search and routes behind our API (ADR 0004): Goong in
 * Vietnam, a second one later for trips abroad. Requests to it carry the
 * search or the two points, never who is asking. `null` means it found
 * nothing; `"unavailable"` means it failed or didn't answer.
 */
export interface MapsProvider {
  suggest(query: string, near: LatLng | undefined): Promise<PlaceSuggestion[] | "unavailable">;
  place(id: string): Promise<Place | null | "unavailable">;
  route(request: RouteRequest): Promise<Route | null | "unavailable">;
}
