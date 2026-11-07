import type { Locale } from "./locales";

const tag = (locale: Locale) => (locale === "vi" ? "vi-VN" : "en-GB");

/** 21:38. Always 24-hour; pass the user's time zone when you know it. */
export function formatTime(epochMs: number, locale: Locale, timeZone = "Asia/Ho_Chi_Minh"): string {
  return new Intl.DateTimeFormat(tag(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(epochMs);
}

/** 3/11/2026 (day/month/year, no leading zeros). */
export function formatDate(epochMs: number, timeZone = "Asia/Ho_Chi_Minh"): string {
  const parts = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", year: "numeric", timeZone })
    .formatToParts(epochMs);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  return `${Number(get("day"))}/${Number(get("month"))}/${get("year")}`;
}

/** 180 m below a kilometre, otherwise 2,4 km (Vietnamese decimal comma). */
export function formatDistance(metres: number, locale: Locale): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  const km = new Intl.NumberFormat(tag(locale), { maximumFractionDigits: 1 }).format(metres / 1000);

  return `${km} km`;
}
