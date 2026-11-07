import { z } from "zod";

/** A phone number in E.164 form, e.g. +84912345678. */
export const E164 = z.string().regex(/^\+[1-9]\d{7,14}$/);

/** Country calling codes the app offers. Vietnam first; more come with other countries. */
export const CALLING_CODES = { VN: "84" } as const;

export type CountryCode = keyof typeof CALLING_CODES;

/**
 * Turns what a person types or a phone book holds ("0912 345 678",
 * "912345678", "+84 912 345 678", "(+84) 912-345-678") into E.164, or null
 * when it can't be a phone number.
 */
export function toE164(input: string, country: CountryCode = "VN"): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) return null;
  let e164: string;

  if (trimmed.startsWith("+")) e164 = `+${digits}`;
  else if (digits.startsWith("00")) e164 = `+${digits.slice(2)}`;
  else {
    const cc = CALLING_CODES[country];
    const national = digits.startsWith("0") ? digits.slice(1) : digits;
    e164 = digits.startsWith(cc) && digits.length > 10 ? `+${digits}` : `+${cc}${national}`;
  }

  // Phone books often keep the trunk zero after the country code: "+84 (0) 912 345 678".
  if (e164.startsWith("+840")) e164 = `+84${e164.slice(4)}`;

  if (country === "VN" && e164.startsWith("+84") && e164.length !== 12) return null;

  return E164.safeParse(e164).success ? e164 : null;
}

/** "+84912345678" → "0912 345 678", the way Vietnamese numbers are written (DS 03). */
export function formatPhone(e164: string): string {
  if (e164.startsWith("+84") && e164.length === 12) {
    const n = `0${e164.slice(3)}`;

    return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
  }

  return e164;
}
