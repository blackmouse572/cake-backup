import type { DeliveryLogEntry, Fetch } from "../src/types";

/** One answer from a fake provider: a JSON body, or `"down"` to fail the request. */
export type FakeAnswer = { status?: number; json: Record<string, string | number | Record<string, string>> } | "down";

/**
 * A `fetch` that answers for Zalo and Twilio from queues of answers, by URL
 * prefix, and keeps every request it got. Nothing leaves the test.
 */
export function fakeFetch(answers: Record<string, FakeAnswer[]>) {
  const requests: Request[] = [];

  const fetch: Fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request.clone());
    const prefix = Object.keys(answers).find((p) => request.url.startsWith(p));
    const answer = prefix ? answers[prefix]!.shift() : undefined;

    if (!answer) throw new Error(`no fake answer left for ${request.url}`);

    if (answer === "down") throw new TypeError("network down");

    return Response.json(answer.json, { status: answer.status ?? 200 });
  };

  return { fetch, requests };
}

/** Collects delivery log lines instead of printing them. */
export function fakeLog() {
  const entries: DeliveryLogEntry[] = [];

  return { entries, log: (entry: DeliveryLogEntry) => void entries.push(entry) };
}

export const ZALO_SEND = "https://business.openapi.zalo.me/message/template";
export const ZALO_TOKEN = "https://oauth.zaloapp.com/v4/oa/access_token";
export const TWILIO_SEND = "https://api.twilio.com/";

export const zaloToken = (n: number): FakeAnswer => ({
  json: { access_token: `access-${n}`, refresh_token: `refresh-${n}`, expires_in: "90000" },
});

export const zaloSent: FakeAnswer = { json: { error: 0, message: "Success", data: { msg_id: "zalo-msg-1" } } };

export const twilioSent: FakeAnswer = { status: 201, json: { sid: "SM123", status: "queued" } };
