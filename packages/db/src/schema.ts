/**
 * D1 holds the low-traffic records that outlive a journey (ADR 0001). A live
 * journey's location stream lives only in its Durable Object, never here.
 *
 * Accounts and sessions come from Better Auth (ADR 0002): `user`, `session`,
 * `account`, `verification` and `rateLimit` below follow its schema, with the
 * phone-number plugin's two columns on `user`.
 */
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

// --- Better Auth ---------------------------------------------------------

/** A traveller. Signed up by phone number only; `email` is a placeholder Better Auth requires. */
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  /** E.164, e.g. +84912345678. */
  phoneNumber: text("phone_number").unique(),
  phoneNumberVerified: integer("phone_number_verified", { mode: "boolean" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

/** One-time codes in flight. Better Auth deletes a row once its code is used. */
export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** Better Auth's per-IP request counters (Workers have no shared memory between requests). */
export const rateLimit = sqliteTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});

/** Every one-time code sent, by number, to cap how many a number can get (each one costs money). */
export const codeRequests = sqliteTable(
  "code_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    phoneNumber: text("phone_number").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("code_requests_phone_idx").on(t.phoneNumber, t.createdAt)],
);

// --- Cage ----------------------------------------------------------------

/** Per-traveller settings. The locale is also used for their SMS and the circle's web view. */
export const travellerSettings = sqliteTable("traveller_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  locale: text("locale", { enum: ["vi", "en"] }).notNull().default("vi"),
  /** Police (Công an 113) are off by default. */
  policeEnabled: integer("police_enabled", { mode: "boolean" }).notNull().default(false),
  /** Hashes only; checked on the server in constant time (ADR 0002). */
  safeCodeHash: text("safe_code_hash"),
  duressCodeHash: text("duress_code_hash"),
  /** Wrong safe codes in a row when changing codes, and when the last one was. */
  codeFailures: integer("code_failures").notNull().default(0),
  codeFailedAt: integer("code_failed_at", { mode: "timestamp_ms" }),
  /** Who the check-in call looks like it is from (screen 14). Null means the default for the language ("Mẹ"). */
  callerName: text("caller_name"),
  /** The check-in call vibrates without ringing. */
  callVibrateOnly: integer("call_vibrate_only", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

/**
 * The traveller's phones, by Expo push token, so the server can ring a
 * check-in call while the app is closed (#20). Deleted on sign-out, and
 * when Expo says the token no longer works.
 */
export const pushTokens = sqliteTable(
  "push_tokens",
  {
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    platform: text("platform", { enum: ["ios", "android"] }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("push_tokens_user_idx").on(t.userId)],
);

/**
 * Trusted contacts, alerted in `position` order. Never listed by name in
 * summaries ("vòng an toàn"). Ids are random and never reused, so a journey
 * link signed for a removed contact can never match a new one (#18).
 */
export const circleContacts = sqliteTable(
  "circle_contacts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** E.164, e.g. +84912345678. */
    phone: text("phone").notNull(),
    position: integer("position").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("circle_contacts_user_idx").on(t.userId),
    uniqueIndex("circle_contacts_user_phone_idx").on(t.userId, t.phone),
  ],
);

/**
 * One row per journey, written at start and end. The Durable Object with the
 * same id holds the live state while it runs.
 */
export const journeys = sqliteTable(
  "journeys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["active", "check_in", "lost_contact", "alerted", "ended"] }).notNull(),
    destinationName: text("destination_name").notNull(),
    expectedArrivalAt: integer("expected_arrival_at", { mode: "timestamp_ms" }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    /** Saved to the journal. Unsaved journeys lose their location data when they end. */
    saved: integer("saved", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("journeys_user_idx").on(t.userId)],
);

/**
 * The safety circle's links to a journey (ADR 0002, #18). One row per link
 * sent: the token itself is never stored, only its SHA-256. A link works while
 * its journey runs and its contact is still in the circle.
 */
export const circleLinks = sqliteTable(
  "circle_links",
  {
    tokenHash: text("token_hash").primaryKey(),
    journeyId: text("journey_id")
      .notNull()
      .references(() => journeys.id, { onDelete: "cascade" }),
    /** Not a foreign key: removing a contact must leave the row, and `isMember` refuses it. */
    contactId: text("contact_id").notNull(),
    /** When this contact first opened the link. Null until they do. */
    openedAt: integer("opened_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("circle_links_journey_idx").on(t.journeyId)],
);

/** Hackathon demo only: the messages the demo would have sent, for the dashboard's log. */
export const demoMessages = sqliteTable(
  "demo_messages",
  {
    id: text("id").primaryKey(),
    journeyId: text("journey_id")
      .notNull()
      .references(() => journeys.id, { onDelete: "cascade" }),
    /** The fake contact's number. */
    to: text("to").notNull(),
    text: text("text").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("demo_messages_journey_idx").on(t.journeyId)],
);

/** Hackathon demo only: wrong `DEMO_KEY` tries per caller (a hash of the IP), for the lockout. */
export const demoLockouts = sqliteTable("demo_lockouts", {
  clientHash: text("client_hash").primaryKey(),
  failures: integer("failures").notNull(),
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Alert history: who was told what, and when. */
export const alertEvents = sqliteTable(
  "alert_events",
  {
    id: text("id").primaryKey(),
    journeyId: text("journey_id").notNull().references(() => journeys.id),
    reason: text("reason", { enum: ["no_answer", "duress", "sos", "lost_contact"] }).notNull(),
    step: text("step", { enum: ["circle", "hotline", "police"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("alert_events_journey_idx").on(t.journeyId)],
);

// --- Message providers ---------------------------------------------------

/**
 * OAuth tokens for message providers that rotate them (Zalo's OA token lasts
 * about a day and each refresh token works once), so they can't be Worker
 * secrets. One row per provider. The first refresh token comes from a secret.
 */
export const providerTokens = sqliteTable("provider_tokens", {
  provider: text("provider", { enum: ["zalo"] }).primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
