import { Place, PlaceSuggestions, Route, decodePolyline } from "@cage/shared";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { goongMaps } from "../src/maps/goong.maps";
import { mapsProviderFor } from "../src/maps-provider";
import { mapsService } from "../src/services/maps.service";
import { fakeFetch } from "./fake-providers";
import { api, readData, readError, signIn } from "./helpers";

const GOONG = "https://rsapi.goong.io/";

const MY_DINH = { lat: 21.0285, lng: 105.7782 };

const DAI_CO_VIET = { lat: 21.0072, lng: 105.843 };

const leg = (m: number, s: number) => ({ distance: { text: "", value: m }, duration: { text: "", value: s } });

const post = (cookie: string, body: Record<string, Record<string, number> | string>) =>
  api("/routes", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) });

describe("place search and routes over HTTP (fixed provider)", () => {
  it("needs a session", async () => {
    expect((await api("/places/suggest?q=ga")).status).toBe(401);
    expect((await api("/places/fixed-my-dinh")).status).toBe(401);
    expect((await post("", { from: MY_DINH, to: DAI_CO_VIET })).status).toBe(401);
  });

  it("suggests places while typing, without diacritics too", async () => {
    const { cookie } = await signIn();

    const res = await api(`/places/suggest?q=${encodeURIComponent("ben xe my dinh")}&near=21.03,105.78`, {
      headers: { cookie },
    });

    expect(res.status).toBe(200);
    expect((await readData(res, PlaceSuggestions)).map((p) => p.name)).toEqual(["Bến xe Mỹ Đình"]);
  });

  it("refuses an empty search and a bad near", async () => {
    const { cookie } = await signIn();

    expect(await readError(await api("/places/suggest?q=", { headers: { cookie } }))).toBe("invalid_request");
    expect(await readError(await api("/places/suggest?q=ga&near=here", { headers: { cookie } }))).toBe(
      "invalid_request",
    );
  });

  it("gives a picked place's position, and 404 for an unknown id", async () => {
    const { cookie } = await signIn();
    const place = await readData(await api("/places/fixed-my-dinh", { headers: { cookie } }), Place);

    expect(place).toMatchObject({ name: "Bến xe Mỹ Đình", ...MY_DINH });
    const missing = await api("/places/nowhere", { headers: { cookie } });
    expect(missing.status).toBe(404);
    expect(await readError(missing)).toBe("not_found");
  });

  it("routes between two points, by motorbike unless asked", async () => {
    const { cookie } = await signIn();
    const res = await post(cookie, { from: MY_DINH, to: DAI_CO_VIET });

    expect(res.status).toBe(200);
    const route = await readData(res, Route);
    expect(route.distanceM).toBeGreaterThan(7_000);
    expect(route.durationS).toBeGreaterThan(0);
    expect(decodePolyline(route.polyline)).toEqual([MY_DINH, DAI_CO_VIET]);
    expect(await readError(await post(cookie, { from: MY_DINH, to: DAI_CO_VIET, mode: "plane" }))).toBe(
      "invalid_request",
    );
  });

  it("stops a traveller who searches too often", async () => {
    const { cookie } = await signIn();
    const statuses: number[] = [];

    for (let i = 0; i < 61; i += 1) statuses.push((await api("/places/suggest?q=ga", { headers: { cookie } })).status);

    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    const last = await api("/places/suggest?q=ga", { headers: { cookie } });
    expect(last.status).toBe(429);
    expect(await readError(last)).toBe("rate_limited");
  });
});

describe("Goong", () => {
  it("sends only the query, the rough area and the key", async () => {
    const { fetch, requests } = fakeFetch({
      [GOONG]: [
        {
          json: {
            status: "OK",
            predictions: [
              {
                place_id: "goong-1",
                description: "Bến xe Mỹ Đình, 20 Phạm Hùng",
                structured_formatting: { main_text: "Bến xe Mỹ Đình", secondary_text: "20 Phạm Hùng, Nam Từ Liêm" },
              },
            ],
          },
        },
      ],
    });

    const result = await mapsService(goongMaps("test-key", fetch)).suggest("Bến xe Mỹ Đình", {
      lat: 21.028512,
      lng: 105.778199,
    });

    expect(result).toEqual([{ id: "goong-1", name: "Bến xe Mỹ Đình", address: "20 Phạm Hùng, Nam Từ Liêm" }]);
    const url = new URL(requests[0]!.url);
    expect(url.origin + url.pathname).toBe("https://rsapi.goong.io/Place/AutoComplete");
    expect(url.searchParams.get("input")).toBe("Bến xe Mỹ Đình");
    expect(url.searchParams.get("location")).toBe("21.03,105.78");
    expect(url.searchParams.get("api_key")).toBe("test-key");
    expect([...requests[0]!.headers.keys()]).toEqual([]);
  });

  it("reads a place's position", async () => {
    const { fetch } = fakeFetch({
      [GOONG]: [
        {
          json: {
            status: "OK",
            result: {
              place_id: "goong-1",
              name: "Bến xe Mỹ Đình",
              formatted_address: "20 Phạm Hùng, Mỹ Đình 2, Nam Từ Liêm, Hà Nội",
              geometry: { location: { lat: 21.0285, lng: 105.7782 } },
            },
          },
        },
        { json: { status: "OK" } },
      ],
    });

    const goong = goongMaps("test-key", fetch);

    expect(await goong.place("goong-1")).toEqual({
      id: "goong-1",
      name: "Bến xe Mỹ Đình",
      address: "20 Phạm Hùng, Mỹ Đình 2, Nam Từ Liêm, Hà Nội",
      ...MY_DINH,
    });
    expect(await goong.place("gone")).toBeNull();
  });

  it("asks for a motorbike route and adds up its legs", async () => {

    const { fetch, requests } = fakeFetch({
      [GOONG]: [{ json: { routes: [{ legs: [leg(9_000, 1_300), leg(300, 140)], overview_polyline: { points: "abc" } }] } }],
    });

    const route = await goongMaps("test-key", fetch).route({ from: MY_DINH, to: DAI_CO_VIET, mode: "motorbike" });

    expect(route).toEqual({ distanceM: 9_300, durationS: 1_440, polyline: "abc" });
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/Direction");
    expect(url.searchParams.get("vehicle")).toBe("bike");
    expect(url.searchParams.get("origin")).toBe("21.0285,105.7782");
  });

  it("is unavailable when Goong fails, is down or answers nonsense", async () => {
    const { fetch } = fakeFetch({
      [GOONG]: [{ status: 403, json: { error: "bad key" } }, "down", { json: { predictions: "nope" } }],
    });

    const goong = goongMaps("test-key", fetch);

    expect(await goong.suggest("ga", undefined)).toBe("unavailable");
    expect(await goong.route({ from: MY_DINH, to: DAI_CO_VIET, mode: "car" })).toBe("unavailable");
    expect(await goong.suggest("ga", undefined)).toBe("unavailable");
  });

  it("needs a key before it answers anything", () => {
    expect(() => mapsProviderFor({ ...env, MAPS_PROVIDER: "goong", GOONG_API_KEY: " " })).toThrow("GOONG_API_KEY");
    expect(() => mapsProviderFor({ ...env, MAPS_PROVIDER: "google" })).toThrow("MAPS_PROVIDER must be one of");
  });
});
