import { formatTime, i18nFor, type Locale } from "@cage/i18n";
import { CIRCLE_LINK, JOURNEY_TOKEN } from "./constants";
import type { DeliveryLogEntry, Message } from "./types";

// --- Encoding ------------------------------------------------------------

const enc = new TextEncoder();
export const toBase64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
export const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const toBase64Url = (bytes: ArrayBuffer | Uint8Array) =>
  toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

// --- Code hashing --------------------------------------------------------
//
// A four-digit code has only 10,000 values, so a slow hash alone would not
// stop anyone holding a copy of the database. Instead each code is an
// HMAC-SHA256 keyed with a server-side secret (`CODE_PEPPER`, a Worker secret
// that never sits in D1) over a per-code random salt. Without the pepper the
// stored values are useless; through the API, guesses are rate limited.

const SCHEME = "hmac-sha256";

async function hmac(pepper: string, salt: Uint8Array, code: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);

  return crypto.subtle.sign("HMAC", key, new Uint8Array([...salt, ...enc.encode(code)]));
}

/** Compares every byte, so the time doesn't depend on where two digests differ. */
function equalDigests(a: ArrayBuffer | Uint8Array, b: Uint8Array): boolean {
  const x = new Uint8Array(a);
  let diff = x.length ^ b.length;

  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ (b[i] ?? 0);

  return diff === 0;
}

/** `hmac-sha256$<salt>$<digest>`, with a fresh random salt each time. */
export async function hashCode(pepper: string, code: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  return `${SCHEME}$${toBase64(salt)}$${toBase64(await hmac(pepper, salt, code))}`;
}

/** Same work whether or not the hash matches, or exists at all. */
export async function matchesHash(pepper: string, code: string, stored: string | null): Promise<boolean> {
  const [scheme, salt, digest] = (stored ?? "").split("$");
  const known = scheme === SCHEME && Boolean(salt) && Boolean(digest);
  const expected = known ? fromBase64(digest!) : new Uint8Array(32);
  const actual = await hmac(pepper, known ? fromBase64(salt!) : new Uint8Array(16), code);

  return equalDigests(actual, expected) && known;
}

/** True when two strings are equal, in a time that doesn't depend on where they differ. */
export function sameString(a: string, b: string): boolean {
  return equalDigests(enc.encode(a), enc.encode(b));
}

// --- Journey tokens and circle links --------------------------------------
//
// Both are random, not signed blobs: only their SHA-256 is stored (journey
// tokens in the journey's Durable Object, circle links in D1) and checked
// against the journey's state on every use, so they die the moment the
// journey ends, with no revocation list and no extra secret.

/** A fresh journey token, e.g. `jt_3q2-...`. */
export function newJourneyToken(): string {
  return JOURNEY_TOKEN.prefix + toBase64Url(crypto.getRandomValues(new Uint8Array(JOURNEY_TOKEN.bytes)));
}

/** A fresh circle link token: short enough for an SMS, 128 bits so it can't be guessed. */
export function newCircleLinkToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(CIRCLE_LINK.bytes)));
}

/** What is stored in place of a journey token or a circle link token. */
export async function hashToken(token: string): Promise<string> {
  return toBase64(await crypto.subtle.digest("SHA-256", enc.encode(token)));
}

/**
 * How the circle sees the traveller's name: the name they set, else their
 * number in the local form (+84912345678 becomes 0912 345 678).
 */
export function displayName(name: string, phoneNumber: string): string {
  if (name.trim()) return name.trim();

  if (!phoneNumber.startsWith("+84")) return phoneNumber;
  const local = `0${phoneNumber.slice(3)}`;

  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`.trim();
}

// --- Messages ------------------------------------------------------------

/** The SMS text of a message. A code message never names Cage, so it reads like any verification message. */
export function messageText(message: Message, locale: Locale): string {
  const { t } = i18nFor(locale);

  switch (message.kind) {
    case "code":
      return t("messages.code", { code: message.code });
    case "journey_started":
      return t("messages.journeyStarted", {
        name: message.name,
        destination: message.destination,
        time: formatTime(message.arriveAt, locale),
        url: message.url,
      });
    case "alert":
      if (message.reason === "lost_contact" && message.likelyBatteryDied) {
        return t("messages.lostContactBattery", { name: message.name, url: message.url });
      }

      return t(`messages.alert.${message.reason}`, { name: message.name, url: message.url });
    case "safe_now":
      return t("messages.safeNow", { name: message.name });
  }
}

/** Zalo wants a Vietnamese number without the plus: +84912345678 becomes 84912345678. */
export function zaloPhone(e164: string): string | null {
  return e164.startsWith("+84") ? e164.slice(1) : null;
}

/** Writes one delivery line to the Worker logs (Workers Logs keeps them). */
export function logDelivery(entry: DeliveryLogEntry): void {
  console.warn(JSON.stringify(entry));
}

/** "0912 ••• 678": enough to recognise a number on a screen others can see. */
export function maskPhone(e164: string): string {
  const local = displayName("", e164).replace(/\s/g, "");

  return local.length < 7 ? local : `${local.slice(0, 4)} ••• ${local.slice(-3)}`;
}
