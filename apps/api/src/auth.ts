import { createDb, schema } from "@cage/db";
import { E164 } from "@cage/shared";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { phoneNumber } from "better-auth/plugins";
import { z } from "zod";
import type { Bindings } from "./bindings";
import { RATE_LIMIT, SESSION, SIGN_IN_CODE } from "./constants";
import { messageSenderFor } from "./message-sender";
import { signInCodesService } from "./services/sign-in-codes.service";

/**
 * Better Auth with phone-number sign-in (ADR 0002). Built per request because
 * the D1 binding and secrets come with the request's `env`.
 *
 * Sessions last a year (SESSION), so the app stays signed in and never opens
 * on a sign-in screen (which would give it away in disguise mode).
 */
/** A verify request that would move the signed-in account to another number. */
const ChangesNumber = z.object({ updatePhoneNumber: z.literal(true) });

export function createAuth(env: Bindings) {
  const db = createDb(env.DB);

  return betterAuth({
    appName: "Cage",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    // The app's deep-link scheme; Better Auth's Expo plugin sends it as the origin.
    trustedOrigins: ["cage://"],
    session: { expiresIn: SESSION.expiresInS, updateAge: SESSION.updateAgeS },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      ...RATE_LIMIT.default,
      customRules: {
        "/phone-number/send-otp": RATE_LIMIT.sendCode,
        "/phone-number/verify": RATE_LIMIT.verifyCode,
      },
    },
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    telemetry: { enabled: false },
    hooks: {
      // Better Auth lets a session move its account to any number it can get a
      // code for. Whoever holds the traveller's unlocked phone could then put
      // their own number on the circle's page, so the number never changes.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/phone-number/verify" && ChangesNumber.safeParse(ctx.body).success) {
          throw new APIError("BAD_REQUEST", { message: "phone_number_fixed" });
        }
      }),
    },
    plugins: [
      expo(),
      phoneNumber({
        otpLength: SIGN_IN_CODE.length,
        expiresIn: SIGN_IN_CODE.expiresInS,
        allowedAttempts: SIGN_IN_CODE.attempts,
        phoneNumberValidator: (n) => E164.safeParse(n).success,
        signUpOnVerification: {
          // Better Auth needs an email; this one can never receive mail.
          getTempEmail: (n) => `${n.replace(/\D/g, "")}@phone.invalid`,
          getTempName: () => "",
        },
        async sendOTP({ phoneNumber: to, code }, ctx) {
          // Built here, not per request, so a missing provider setting only breaks sending codes.
          const codes = signInCodesService(db, messageSenderFor(env, db));
          const result = await codes.send(to, code, ctx?.headers);

          if (result === "too_many") throw new APIError("TOO_MANY_REQUESTS", { message: "too_many_codes" });

          if (result === "not_sent") throw new APIError("SERVICE_UNAVAILABLE", { message: "code_not_sent" });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
