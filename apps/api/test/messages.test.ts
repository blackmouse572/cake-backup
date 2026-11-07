import { describe, expect, it } from "vitest";
import { displayName, messageText } from "../src/utils";

describe("circle messages", () => {
  const url = "https://cage.vn/t/abc";

  it("tells the circle a journey started, with the link and the arrival time in Vietnam", () => {
    const arriveAt = Date.UTC(2026, 10, 5, 14, 58);
    const text = messageText({ kind: "journey_started", name: "Lan", destination: "Nhà nghỉ Bờ Sông", arriveAt, url }, "vi");
    expect(text).toBe(`Lan vừa bắt đầu chuyến đi tới Nhà nghỉ Bờ Sông, dự kiến đến lúc 21:58. Theo dõi tại ${url}`);
  });

  it("asks the circle not to contact the traveller after the duress PIN", () => {
    expect(messageText({ kind: "alert", reason: "duress", name: "Lan", url }, "vi")).toContain("Đừng gọi hay nhắn cho Lan");
    expect(messageText({ kind: "alert", reason: "duress", name: "Lan", url }, "en")).toContain("Don't call or message Lan");
  });

  it("has a message for every alert reason in every language", () => {
    for (const locale of ["vi", "en"] as const) {
      for (const reason of ["no_answer", "duress", "sos", "lost_contact"] as const) {
        const text = messageText({ kind: "alert", reason, name: "Lan", url }, locale);
        expect(text).toContain(url);
        expect(text).not.toContain("!");
      }
    }
  });
});

describe("displayName", () => {
  it("uses the name when there is one", () => {
    expect(displayName(" Lan ", "+84912345678")).toBe("Lan");
  });

  it("falls back to the local form of a Vietnamese number", () => {
    expect(displayName("", "+84912345678")).toBe("0912 345 678");
  });
});
