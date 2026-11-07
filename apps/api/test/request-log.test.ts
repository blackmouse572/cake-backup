import { afterEach, describe, expect, it, vi } from "vitest";
import { api, send } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("request log", () => {
  it("logs the route pattern and status, without the body or the caller's address", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});

    await send("/journeys/not-a-journey/updates", "POST", { lat: "10.7769", phone: "+84901234567" }, {
      "cf-connecting-ip": "203.0.113.7",
    });

    const lines = log.mock.calls.map((call) => JSON.stringify(call));
    const line = lines.find((l) => l.includes('"event":"request"'));

    expect(line).toBeDefined();
    expect(line).toContain('"route":"/journeys/:id/updates"');
    expect(line).toContain('"method":"POST"');
    expect(lines.join("\n")).not.toMatch(/84901234567|203\.0\.113\.7|10\.7769|not-a-journey/);
  });

  it("logs a request that matches no route", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});

    const res = await api("/nowhere");

    expect(res.status).toBe(404);
    expect(JSON.stringify(log.mock.calls)).toContain('"status":404');
  });
});
