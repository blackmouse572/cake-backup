import type { JourneyObject } from "./journey-object";

/**
 * The API's bindings, spelled out instead of using the global `Env` from
 * `wrangler types`, so that other workspaces (the website) can typecheck the
 * RPC client against their own `Env`. Keep in step with wrangler.jsonc.
 */
export interface Bindings {
  DB: D1Database;
  JOURNEY: DurableObjectNamespace<JourneyObject>;
  /** Public URL of this API, e.g. https://api.cage.vn. */
  BETTER_AUTH_URL: string;
  /** The circle's website, e.g. https://cage.vn. Circle links point at `<this>/t/<token>`. */
  CIRCLE_WEB_URL: string;
  /** Who sends messages: "zalo+sms", "zalo", "sms", "console" (local) or "none" (tests). See message-sender.ts. */
  MESSAGE_SENDER: string;
  /**
   * "on" opens `/demo`: anyone can start a fake traveller's journey and drive
   * it, for the hackathon demo. Only the `demo` environment sets it, and its
   * messages only go to the log.
   */
  DEMO_MODE?: string;
  /**
   * Secret, demo only. When set, every `/demo` request must carry it in the
   * `x-demo-key` header, so only our dashboard and demo phone can drive trips.
   */
  DEMO_KEY?: string;
  /**
   * Demo only: the phone numbers (E.164, comma-separated) whose trips the
   * dashboard may show and drive. Unset, every trip on the demo server.
   */
  DEMO_ACCOUNTS?: string;
  /** Who answers place search and routes: "goong", or "fixed" (a few made-up places, for local dev and tests). See maps-provider.ts. */
  MAPS_PROVIDER: string;
  /** Secret, when MAPS_PROVIDER is "goong". Goong's REST API key (account.goong.io). */
  GOONG_API_KEY?: string;
  /** Limits each traveller's place searches and routes; every call to Goong costs money. */
  MAPS_RATE_LIMIT: RateLimit;
  /** Secret. Signs sessions. */
  BETTER_AUTH_SECRET: string;
  /** Secret. Keys the safe code and duress PIN hashes; never stored in D1. */
  CODE_PEPPER: string;

  // Zalo ZNS, needed when MESSAGE_SENDER includes zalo.
  /** The Zalo app id (developers.zalo.me), linked to the Official Account. */
  ZALO_APP_ID?: string;
  /** Secret. The Zalo app's secret key. */
  ZALO_APP_SECRET?: string;
  /** Secret. The first OA refresh token; after that the pair rotates in D1 (`provider_tokens`). */
  ZALO_REFRESH_TOKEN?: string;
  /** Approved ZNS template id for the code message in Vietnamese. */
  ZALO_ZNS_CODE_TEMPLATE_VI?: string;
  /** Same in English. Without it, English speakers get their code by SMS. */
  ZALO_ZNS_CODE_TEMPLATE_EN?: string;
  /** "true" sends in ZNS development mode (only to the OA's admins). */
  ZALO_ZNS_DEVELOPMENT?: string;

  // SMS, needed when MESSAGE_SENDER includes sms.
  /** "twilio" for now. */
  SMS_PROVIDER?: string;
  TWILIO_ACCOUNT_SID?: string;
  /** Secret. */
  TWILIO_AUTH_TOKEN?: string;
  /** Sender: a Twilio number, an approved brandname, or a messaging service id (MG...). */
  SMS_FROM?: string;
}
