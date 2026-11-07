/**
 * Limits and lifetimes for sign-in and the safe code (ADR 0002). Journey
 * timers are domain rules and live in `@cage/shared` (`TIMERS`).
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_S = 24 * 60 * 60;

export const SESSION = {
  /** A year, so the app stays signed in and never opens on a sign-in screen. */
  expiresInS: 365 * DAY_S,
  /** How often an active session is refreshed. */
  updateAgeS: DAY_S,
} as const;

export const SIGN_IN_CODE = {
  length: 6,
  expiresInS: 5 * 60,
  /** Wrong tries allowed on one code. */
  attempts: 5,
  /** Codes one number can get per hour: each one costs money. */
  perNumberPerHour: 5,
  perNumberWindowMs: HOUR_MS,
} as const;

/** Better Auth's per-IP limits, in seconds and requests. */
export const RATE_LIMIT = {
  default: { window: 60, max: 60 },
  sendCode: { window: 10 * 60, max: 5 },
  verifyCode: { window: 10 * 60, max: 10 },
} as const;

/** Wrong safe codes allowed when changing codes, per window. */
export const CHANGE_CODES = {
  tries: 5,
  windowMs: 15 * MINUTE_MS,
} as const;

/**
 * The "Quên mã?" (forgot code) path: new codes without the current safe
 * code, only from a session created this recently, i.e. right after a fresh
 * sign-in code to the traveller's phone.
 */
export const RESET_CODES = {
  freshSessionMs: 10 * MINUTE_MS,
} as const;

/** Zalo ZNS (template messages to a phone number) and the Zalo OA token it needs. */
export const ZALO_ZNS = {
  sendUrl: "https://business.openapi.zalo.me/message/template",
  tokenUrl: "https://oauth.zaloapp.com/v4/oa/access_token",
  /** The parameter name for the code in the approved ZNS code template. */
  codeParam: "otp",
  /** Refresh the access token this long before Zalo says it expires. */
  refreshMarginMs: 10 * MINUTE_MS,
  errors: {
    /** The access token is invalid or expired: refresh once and retry. */
    invalidToken: -124,
    /** The number has no Zalo account, or it is inactive. */
    noZaloAccount: -118,
  },
} as const;

export const TWILIO = {
  apiBase: "https://api.twilio.com/2010-04-01",
} as const;

/** Goong's REST API (ADR 0004): place search and routes in Vietnam. */
export const GOONG = {
  apiBase: "https://rsapi.goong.io",
  /** Suggestions shown while typing. */
  suggestLimit: 6,
  /** Suggestions favour places this close to `near`, in kilometres. */
  nearRadiusKm: 50,
  /** Our route modes in Goong's `vehicle` names. */
  vehicle: { motorbike: "bike", car: "car" },
} as const;

/** The "fixed" maps provider (local dev, tests): routes are straight lines at these speeds. */
export const FIXED_MAPS = {
  speedMps: { motorbike: 7, car: 8 },
  /** Streets are longer than a straight line. */
  detour: 1.3,
} as const;

/**
 * Searches send `near` rounded to this many decimals (2 is about 1 km), so
 * the provider learns the area someone is in, not their doorstep.
 */
export const NEAR_DECIMALS = 2;

/** How long to wait for a message or maps provider before giving up on it. */
export const PROVIDER_TIMEOUT_MS = 8_000;

/** The journey token the app sends with location updates (ADR 0002). */
export const JOURNEY_TOKEN = {
  /** Random bytes in a token: 256 bits, so it can't be guessed. */
  bytes: 32,
  /** Marks the string as a journey token in logs and bug reports. */
  prefix: "jt_",
} as const;

/** The safety circle's link to a journey (#18): `<CIRCLE_WEB_URL>/t/<token>`. */
export const CIRCLE_LINK = {
  /** 128 random bits: 22 characters in the link, unguessable. */
  bytes: 16,
} as const;

/** Wrong codes allowed on one check-in before it counts as no answer. */
export const CHECK_IN = {
  wrongTries: 5,
} as const;

/** The hackathon demo dashboard (`DEMO_MODE`, `/demo`). */
export const DEMO = {
  /** The demo never messages anyone: it only runs with a sender that sends nothing. */
  silentSenders: ["console", "none"],
  /** Header that carries `DEMO_KEY`. */
  keyHeader: "x-demo-key",
  /** Set by the demo website on calls through its service binding: the visitor's IP, for the lockout. */
  clientHeader: "x-demo-client",
  /** Wrong keys allowed before a caller is locked out, and for how long. */
  keyTries: 5,
  lockoutMs: 15 * MINUTE_MS,
  /** The dashboard lists trips that started this long ago or less. */
  listWindowMs: 12 * 60 * MINUTE_MS,
} as const;
