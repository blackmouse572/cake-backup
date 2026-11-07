import { createApiClient } from "@cage/api";
import {
  ApiData,
  ApiError,
  CircleJourneyView,
  DemoJourneyView,
  DemoMessage,
  DemoMove,
  DemoTraveller,
} from "@cage/shared";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { viewerLocale } from "./locale";

const LangInput = z.object({ lang: z.string().optional() });

export const getLocale = createServerFn({ method: "GET" })
  .validator(LangInput)
  .handler(({ data }) => ({ locale: viewerLocale(data.lang) }));

/**
 * Load a journey for the safety circle by their link (#18). An unknown,
 * ended or revoked link comes back as null and the page shows "trip ended".
 */
export const getCircleJourney = createServerFn({ method: "GET" })
  .validator(LangInput.extend({ token: z.string().min(1).max(100) }))
  .handler(async ({ data }) => {
    const { env } = await import("cloudflare:workers");
    const api = createApiClient("https://api.internal", { fetch: env.API.fetch.bind(env.API) });
    const res = await api.links[":token"].$get({ param: { token: data.token } });
    const journey = res.ok ? ApiData(CircleJourneyView).parse(await res.json()).data : null;

    // "Updated n seconds ago" is measured on the server, so the page renders the
    // same on the server and in the browser.
    return { journey, locale: viewerLocale(data.lang, journey?.locale), now: Date.now() };
  });

// --- Hackathon demo dashboard (only when the API has DEMO_MODE) -----------

/**
 * The API through the service binding, with the key the presenter typed and
 * the visitor's IP, so the API's lockout counts this visitor and not the website.
 */
async function demoApi(key: string) {
  const { env } = await import("cloudflare:workers");
  const client = getRequestHeader("cf-connecting-ip") ?? "local";

  const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    request.headers.set("x-demo-key", key);
    request.headers.set("x-demo-client", client);

    return env.API.fetch(request);
  };

  return createApiClient("https://api.internal", { fetch });
}

/** Why the dashboard can't go on: the demo is off, the key is wrong, or this visitor is locked out. */
export type DemoRefusal = "off" | "wrong_key" | "locked";

function refusal(body: ReturnType<typeof ApiError.safeParse>): DemoRefusal {
  const code = body.success ? body.data.error.code : null;

  if (code === "wrong_demo_key") return "wrong_key";

  return code === "demo_locked" ? "locked" : "off";
}

const Key = z.object({ key: z.string().min(1).max(200) });

const Trip = Key.extend({ id: z.string().min(1).max(100) });

/** Checks the key and lists everyone on a trip, for the "choose a traveller" step. */
export const demoTravellers = createServerFn({ method: "POST" })
  .validator(Key)
  .handler(async ({ data }): Promise<{ travellers: DemoTraveller[] } | { refused: DemoRefusal }> => {
    const res = await (await demoApi(data.key)).demo.journeys.$get();

    return res.ok ? { travellers: ApiData(z.array(DemoTraveller)).parse(await res.json()).data } : { refused: refusal(ApiError.safeParse(await res.json().catch(() => null))) };
  });

/** The chosen trip as the dashboard sees it, its message log, and the server's clock. Null once the trip is gone. */
export const demoTrip = createServerFn({ method: "POST" })
  .validator(Trip)
  .handler(async ({ data }) => {
    const api = await demoApi(data.key);
    const param = { id: data.id };
    const [trip, log] = await Promise.all([api.demo.journeys[":id"].$get({ param }), api.demo.journeys[":id"].log.$get({ param })]);

    if (!trip.ok || !log.ok) return null;

    return {
      journey: ApiData(DemoJourneyView).parse(await trip.json()).data,
      log: ApiData(z.array(DemoMessage)).parse(await log.json()).data,
      now: Date.now(),
    };
  });

/** One dashboard control on the chosen trip. Returns the API's status (204 when it worked). */
export const demoControl = createServerFn({ method: "POST" })
  .validator(
    Trip.extend({
      control: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("check-in") }),
        z.object({ kind: z.literal("skip") }),
        z.object({ kind: z.literal("lose-contact") }),
        z.object({ kind: z.literal("move"), move: DemoMove }),
        z.object({ kind: z.literal("delete") }),
      ]),
    }),
  )
  .handler(async ({ data }): Promise<{ status: number }> => {
    const trip = (await demoApi(data.key)).demo.journeys[":id"];
    const param = { id: data.id };
    const { control } = data;

    switch (control.kind) {
      case "check-in":
        return { status: (await trip["check-in"].$post({ param })).status };
      case "skip":
        return { status: (await trip.skip.$post({ param })).status };
      case "lose-contact":
        return { status: (await trip["lose-contact"].$post({ param })).status };
      case "move":
        return { status: (await trip.move.$post({ param, json: control.move })).status };
      case "delete":
        return { status: (await trip.$delete({ param })).status };
    }
  });
