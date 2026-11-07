import { describe, expect, it } from "vitest";
import { decodePolyline, encodePolyline, PlaceSuggestQuery, RouteRequest } from "./places";

describe("polylines", () => {
  it("decodes Google's example", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });

  it("round-trips points in Hanoi", () => {
    const points = [
      { lat: 21.0285, lng: 105.7782 },
      { lat: 21.0174, lng: 105.8031 },
      { lat: 21.005, lng: 105.843 },
    ];

    expect(decodePolyline(encodePolyline(points))).toEqual(points);
  });

  it("decodes nothing from an empty string", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});

describe("place search query", () => {
  it("reads near as a point", () => {
    expect(PlaceSuggestQuery.parse({ q: " Bến xe Mỹ Đình ", near: "21.0285,105.7782" })).toEqual({
      q: "Bến xe Mỹ Đình",
      near: { lat: 21.0285, lng: 105.7782 },
    });
  });

  it("refuses an empty search and a point off the globe", () => {
    expect(PlaceSuggestQuery.safeParse({ q: "  " }).success).toBe(false);
    expect(PlaceSuggestQuery.safeParse({ q: "Ga", near: "91,105" }).success).toBe(false);
    expect(PlaceSuggestQuery.safeParse({ q: "Ga", near: "hà nội" }).success).toBe(false);
  });
});

describe("route request", () => {
  it("defaults to a motorbike", () => {
    const from = { lat: 21.0285, lng: 105.7782 };
    const to = { lat: 21.005, lng: 105.843 };

    expect(RouteRequest.parse({ from, to }).mode).toBe("motorbike");
  });
});
