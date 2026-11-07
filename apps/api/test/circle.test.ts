import { createDb } from "@cage/db";
import { Circle, CIRCLE, Me } from "@cage/shared";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { circleService } from "../src/services/circle.service";
import { api, newNumber, readData, readError, signIn } from "./helpers";

type NewContact = { name: string; phone: string };

const call = (cookie: string, method: string, path: string, body?: { contacts: NewContact[] } | { ids: string[] }) =>
  api(`/circle${path}`, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const add = (cookie: string, contacts: NewContact[]) => call(cookie, "POST", "", { contacts });

const list = async (cookie: string) => readData(await call(cookie, "GET", ""), Circle);

describe("the safety circle", () => {
  it("needs a session", async () => {
    const res = await api("/circle");
    expect(res.status).toBe(401);
    expect(await readError(res)).toBe("unauthorized");
  });

  it("adds contacts in order and stores numbers in E.164", async () => {
    const { cookie } = await signIn();

    const res = await add(cookie, [
      { name: "Mai", phone: "0912 345 678" },
      { name: "Daniel", phone: "(+84) 908-112-233" },
    ]);

    expect(res.status).toBe(201);
    const circle = await readData(res, Circle);
    expect(circle.map((c) => [c.name, c.phone])).toEqual([
      ["Mai", "+84912345678"],
      ["Daniel", "+84908112233"],
    ]);
    expect(await list(cookie)).toEqual(circle);
    const me = await readData(await api("/me", { headers: { cookie } }), Me);
    expect(me.circleSize).toBe(2);
  });

  it("adds new contacts after the existing ones and skips numbers it already has", async () => {
    const { cookie } = await signIn();
    await add(cookie, [{ name: "Mai", phone: "0912 345 678" }]);

    const circle = await readData(
      await add(cookie, [
        { name: "Mai again", phone: "+84 912 345 678" },
        { name: "Bố", phone: "0983 556 102" },
        { name: "Bố", phone: "0983556102" },
      ]),
      Circle,
    );

    expect(circle.map((c) => c.name)).toEqual(["Mai", "Bố"]);
  });

  it("refuses a number that can't be a phone, or the traveller's own, and adds nothing", async () => {
    const { cookie, phoneNumber } = await signIn();

    const bad = await add(cookie, [
      { name: "Mai", phone: "0912 345 678" },
      { name: "Typo", phone: "0912 34" },
    ]);

    expect(bad.status).toBe(400);
    expect(await readError(bad)).toBe("invalid_phone");
    expect(await readError(await add(cookie, [{ name: "Me", phone: phoneNumber }]))).toBe("own_number");
    expect(await list(cookie)).toEqual([]);
    expect(await readError(await add(cookie, [{ name: " ", phone: "0912 345 678" }]))).toBe("invalid_request");
  });

  it("stops at the largest circle", async () => {
    const { cookie } = await signIn();
    const many = Array.from({ length: CIRCLE.max }, () => ({ name: "Bạn", phone: newNumber() }));
    expect((await add(cookie, many)).status).toBe(201);
    const full = await add(cookie, [{ name: "One more", phone: newNumber() }]);
    expect(full.status).toBe(409);
    expect(await readError(full)).toBe("circle_full");
  });

  it("reorders contacts", async () => {
    const { cookie } = await signIn();

    const [mai, daniel, bo] = await readData(
      await add(cookie, [
        { name: "Mai", phone: "0912 345 678" },
        { name: "Daniel", phone: "0908 112 233" },
        { name: "Bố", phone: "0983 556 102" },
      ]),
      Circle,
    );

    const res = await call(cookie, "PUT", "/order", { ids: [bo!.id, mai!.id, daniel!.id] });
    expect(res.status).toBe(200);
    expect((await readData(res, Circle)).map((c) => c.name)).toEqual(["Bố", "Mai", "Daniel"]);
    expect((await list(cookie)).map((c) => c.name)).toEqual(["Bố", "Mai", "Daniel"]);
  });

  it("refuses an order that doesn't name every contact exactly once", async () => {
    const { cookie } = await signIn();

    const [mai, daniel] = await readData(
      await add(cookie, [
        { name: "Mai", phone: "0912 345 678" },
        { name: "Daniel", phone: "0908 112 233" },
      ]),
      Circle,
    );

    for (const ids of [[mai!.id], [mai!.id, mai!.id], [mai!.id, daniel!.id, "other"], [mai!.id, "other"]]) {
      const res = await call(cookie, "PUT", "/order", { ids });
      expect(res.status).toBe(409);
      expect(await readError(res)).toBe("order_mismatch");
    }
  });

  it("removes a contact", async () => {
    const { cookie } = await signIn();

    const [mai, daniel] = await readData(
      await add(cookie, [
        { name: "Mai", phone: "0912 345 678" },
        { name: "Daniel", phone: "0908 112 233" },
      ]),
      Circle,
    );

    expect((await call(cookie, "DELETE", `/${mai!.id}`)).status).toBe(204);
    expect(await list(cookie)).toEqual([daniel]);
    expect(await readError(await call(cookie, "DELETE", `/${mai!.id}`))).toBe("not_found");
  });

  it("keeps each traveller's circle to themselves", async () => {
    const lan = await signIn();
    const other = await signIn();
    const [mai] = await readData(await add(lan.cookie, [{ name: "Mai", phone: "0912 345 678" }]), Circle);
    expect(await list(other.cookie)).toEqual([]);
    const del = await call(other.cookie, "DELETE", `/${mai!.id}`);
    expect(del.status).toBe(404);
    expect(await readError(del)).toBe("not_found");
    expect(await readError(await call(other.cookie, "PUT", "/order", { ids: [mai!.id] }))).toBe("order_mismatch");
    expect(await list(lan.cookie)).toEqual([mai]);
    // The same number may sit in two travellers' circles.
    expect((await add(other.cookie, [{ name: "Mai", phone: "0912 345 678" }])).status).toBe(201);
  });
});

async function userIdOf(phoneNumber: string): Promise<string> {
  const row = await env.DB.prepare("select id from user where phone_number = ?").bind(phoneNumber).first<{ id: string }>();
  expect(row).not.toBeNull();

  return row!.id;
}

describe("revoking a removed contact's journey links", () => {
  it("stops matching a contact once removed, and never for another traveller", async () => {
    const lan = await signIn();
    const other = await signIn();
    const [mai] = await readData(await add(lan.cookie, [{ name: "Mai", phone: "0912 345 678" }]), Circle);
    const circle = circleService(createDb(env.DB));
    const [lanId, otherId] = await Promise.all([userIdOf(lan.phoneNumber), userIdOf(other.phoneNumber)]);
    expect(await circle.isMember(lanId, mai!.id)).toBe(true);
    expect(await circle.isMember(otherId, mai!.id)).toBe(false);
    await call(lan.cookie, "DELETE", `/${mai!.id}`);
    expect(await circle.isMember(lanId, mai!.id)).toBe(false);
  });
});
