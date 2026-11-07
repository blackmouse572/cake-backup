import { ApiData, ApiError, type ErrorCode } from "@cage/shared";
import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { expect } from "vitest";
import { z } from "zod";

export const api = (path: string, init?: RequestInit) => exports.default.fetch(`https://api.test${path}`, init);

/** Reads a success body (`{ data }`) and parses its data with the schema. */
export async function readData<T extends z.ZodType>(res: Response, schema: T): Promise<z.output<T>> {
  return schema.parse(ApiData(z.unknown()).parse(await res.json()).data);
}

/** Reads an error body (`{ error: { code } }`) and returns its code. */
export async function readError(res: Response): Promise<ErrorCode> {
  return ApiError.parse(await res.json()).error.code;
}

/** A JSON request body: the tests only send flat objects of strings. */
export type JsonBody = Record<string, string>;

export function send(path: string, method: string, body: JsonBody, headers: HeadersInit = {}) {
  return api(path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** The code Better Auth stored for a number (tests send nothing; MESSAGE_SENDER is "none"). */
export async function pendingCode(phoneNumber: string): Promise<string> {
  const row = await env.DB.prepare("select value from verification where identifier = ? order by created_at desc")
    .bind(`phone-number-otp-${phoneNumber}`)
    .first<{ value: string }>();

  expect(row).not.toBeNull();

  return row!.value.split(":")[0]!;
}

let counter = 0;

/** A fresh Vietnamese number for each call, so tests don't share accounts or limits. */
export function newNumber(): string {
  counter += 1;

  return `+8490${String(Date.now() % 100_000).padStart(5, "0")}${String(counter % 100).padStart(2, "0")}`;
}

let ips = 0;

/** Signs a number in and returns the session cookie. */
export async function signIn(phoneNumber = newNumber()): Promise<{ cookie: string; phoneNumber: string }> {
  // Each sign-in from its own address, so Better Auth's per-IP limits don't add up across tests.
  ips += 1;
  const ip = { "cf-connecting-ip": `10.1.${Math.floor(ips / 250)}.${ips % 250}` };
  expect((await send("/auth/phone-number/send-otp", "POST", { phoneNumber }, ip)).status).toBe(200);
  const code = await pendingCode(phoneNumber);
  const res = await send("/auth/phone-number/verify", "POST", { phoneNumber, code }, ip);
  expect(res.status).toBe(200);

  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

  expect(cookie).toContain("session_token");

  return { cookie, phoneNumber };
}
