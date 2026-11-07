import { describe, expect, it } from "vitest";
import {
  createI18n,
  formatDate,
  formatDistance,
  formatTime,
  i18nFor,
  matchLocale,
  resolveWebLocale,
} from "./index";
import en from "../languages/en.json";
import vi from "../languages/vi.json";

const catalogs = { vi, en };

interface Catalog {
  [key: string]: string | Catalog;
}

/** Every string in a catalog as [dot path, text]. */
function strings(catalog: Catalog, path = ""): [string, string][] {
  return Object.entries(catalog).flatMap(([key, value]): [string, string][] => {
    const at = path ? `${path}.${key}` : key;

    return value instanceof Object ? strings(value, at) : [[at, value]];
  });
}

const keys = (catalog: Catalog) => strings(catalog).map(([k]) => k).toSorted();

describe("translate", () => {
  it("defaults to Vietnamese and fills in parameters", () => {
    const { t } = createI18n("vi");
    expect(t("checkIn.imSafe")).toBe("Tôi an toàn");
    expect(t("web.willArrive", { name: "Lan", time: "21:58" })).toBe("Lan sẽ đến nơi lúc 21:58");
  });

  it("speaks English when asked", () => {
    expect(i18nFor("en").t("journey.status.lost_contact")).toBe("Lost contact");
  });

  it("switches language on the same instance", async () => {
    const i18n = createI18n();
    await i18n.changeLanguage("en");
    expect(i18n.t("checkIn.imSafe")).toBe("I'm safe");
  });
});

describe("copy rules", () => {
  for (const [locale, messages] of Object.entries(catalogs)) {
    it(`${locale} has no exclamation marks`, () => {
      const bad = strings(messages).filter(([, s]) => s.includes("!"));
      expect(bad).toEqual([]);
    });
  }

  it("the check-in call never gives Cage away", () => {
    const banned = /cage|an toàn|cảnh báo|công an/i;
    const bad = strings(catalogs.vi.call).filter(([, s]) => banned.test(s));
    expect(bad).toEqual([]);
  });

  it("the fake call's caller names never give Cage away", () => {
    const banned = /cage|an toàn|cảnh báo|công an/i;
    const bad = strings(catalogs.vi.fakeCall.callers).filter(([, s]) => banned.test(s));
    expect(bad).toEqual([]);
  });

  it("every locale has the same keys", () => {
    expect(keys(catalogs.en)).toEqual(keys(catalogs.vi));
  });
});

describe("locale matching", () => {
  it("picks the phone's first supported language, else Vietnamese", () => {
    expect(matchLocale(["fr-FR", "en-US", "vi-VN"])).toBe("en");
    expect(matchLocale(["vi-VN"])).toBe("vi");
    expect(matchLocale(["zh-CN"])).toBe("vi");
    expect(matchLocale([])).toBe("vi");
  });
});

describe("formats", () => {
  const t = Date.UTC(2026, 10, 3, 14, 38); // 21:38 in Ho Chi Minh City
  it("matches the design system formats", () => {
    expect(formatTime(t, "vi")).toBe("21:38");
    expect(formatDate(t)).toBe("3/11/2026");
    expect(formatDistance(2400, "vi")).toBe("2,4 km");
    expect(formatDistance(180, "vi")).toBe("180 m");
    expect(formatDistance(2400, "en")).toBe("2.4 km");
  });
});

describe("web view language", () => {
  it("prefers ?lang, then the cookie, then the traveller's language", () => {
    expect(resolveWebLocale({ query: "en", cookie: "vi", traveller: "vi" })).toBe("en");
    expect(resolveWebLocale({ query: "fr", cookie: "en", traveller: "vi" })).toBe("en");
    expect(resolveWebLocale({ traveller: "en" })).toBe("en");
    expect(resolveWebLocale({})).toBe("vi");
  });
});
