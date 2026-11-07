import { z } from "zod";

/**
 * The escalation ladder: safety circle first, then a hotline or NGO
 * (Tổng đài 111, Blue Dragon), then police (Công an 113) only if the user
 * turned it on. See "Escalation ladder" in docs/PRD.md.
 */
export const LADDER = ["circle", "hotline", "police"] as const;

export type EscalationStep = (typeof LADDER)[number];

export const AlertReason = z.enum(["no_answer", "duress", "sos", "lost_contact"]);

export type AlertReason = z.infer<typeof AlertReason>;

export interface EscalationSettings {
  /** Off by default. For migrants or people without papers, police can be risky. */
  policeEnabled: boolean;
}

/** The steps this alert may climb, in order. */
export function ladderFor(reason: AlertReason, settings: EscalationSettings): EscalationStep[] {
  // Silence alone only reaches the circle, never police or hotlines.
  if (reason === "lost_contact") return ["circle"];

  return LADDER.filter((step) => step !== "police" || settings.policeEnabled);
}

/** The step after `current`, or null at the top of the ladder. */
export function nextStep(
  current: EscalationStep,
  reason: AlertReason,
  settings: EscalationSettings,
): EscalationStep | null {
  const steps = ladderFor(reason, settings);
  const i = steps.indexOf(current);

  return i === -1 ? null : (steps[i + 1] ?? null);
}

/**
 * Numbers the circle's page offers once an alert is out (#22, hotline step).
 * Nobody is called automatically: there is no partner agreement yet (PRD,
 * open questions).
 */
export const HOTLINES = {
  /** Tổng đài 111, the national child protection and anti-trafficking line. */
  national: "111",
  /** Blue Dragon Children's Foundation. */
  blueDragon: "18001567",
  /** Công an. */
  police: "113",
} as const;
