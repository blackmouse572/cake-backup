/**
 * Design tokens from the canvas design system ("DS 01 Foundations" and the
 * `design-system` style guide on https://doop.design/c/2v_tmcapn2). The
 * canvas wins on any conflict: change it there first, then here.
 *
 * Rules that numbers can't hold:
 * - Route blue means "you / live route" only, never an alert.
 * - Red, green, amber and info blue mean status only. Buttons are never red or green.
 * - Check-in call screens use none of: logo, serif, route blue.
 */
export const color = {
  bgPrimary: "#fcfcfc",
  surface: "#ffffff",
  surfaceSunken: "#f8f8f8",
  surfaceHover: "#f4f4f4",
  chip: "#f1f1f1",
  track: "#e9e9e9",
  border: "#ebebeb",
  divider: "#dedede",
  borderStrong: "#8c8c8c",
  fgPrimary: "#111111",
  fgSecondary: "#5f5f5f",
  fgTertiary: "#707070",
  onFg: "#ffffff",
  surfaceInverse: "#111111",
  blue: "#0090ff",
  blueTint: "#d9eeff",
  blueText: "#0070d6",
  focus: "#0070d6",
  success: "#12a150",
  successTint: "#e6f6ee",
  successText: "#0f7a45",
  danger: "#e5484d",
  dangerTint: "#feebec",
  dangerText: "#c62a2f",
  warning: "#cc7a00",
  warningTint: "#fff4dc",
  warningText: "#8a5200",
  info: "#0090ff",
  infoTint: "#eaf5ff",
  infoText: "#0066c4",
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32, 8: 48 } as const;

export const radius = { xs: 8, sm: 12, md: 20, lg: 32, pill: 999 } as const;

export const font = {
  /** Screen titles and the brand header only. */
  serif: "Geist Serif",
  /** Everything else, including numbers. */
  sans: "Inter",
} as const;

/** [size, lineHeight, weight, letterSpacing em] */
export const type = {
  screenTitle: { family: font.serif, size: 30, lineHeight: 36, weight: 500, tracking: -0.01 },
  brandHeader: { family: font.serif, size: 22, lineHeight: 28, weight: 500, tracking: 0 },
  callName: { family: font.sans, size: 44, lineHeight: 52, weight: 400, tracking: -0.01 },
  countdown: { family: font.sans, size: 36, lineHeight: 40, weight: 400, tracking: -0.02 },
  title: { family: font.sans, size: 18, lineHeight: 24, weight: 500, tracking: 0 },
  body: { family: font.sans, size: 16, lineHeight: 24, weight: 400, tracking: 0 },
  caption: { family: font.sans, size: 15, lineHeight: 20, weight: 400, tracking: 0 },
  sectionLabel: { family: font.sans, size: 13, lineHeight: 16, weight: 500, tracking: 0.06 },
  mapLabel: { family: font.sans, size: 10, lineHeight: 12, weight: 500, tracking: 0 },
} as const;

export const shadow = {
  card: "0 1px 2px rgba(17,17,17,0.04)",
  knob: "0 1px 3px rgba(17,17,17,0.2)",
  /** Only things floating over the map. */
  raised: "0 8px 24px rgba(17,17,17,0.12)",
} as const;

export const layout = {
  pageGutter: 16,
  sheetPaddingTop: 28,
  sheetPaddingX: 20,
  buttonHeight: { sm: 32, md: 40, lg: 48 },
  minTapTarget: 40,
} as const;

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * The `:root` block the canvas screens use, with the same variable names
 * (`--fg-primary`, `--radius-md`, `--font-lora`...), for the website.
 */
export function cssVariables(): string {
  const vars: string[] = [];

  for (const [k, v] of Object.entries(color)) vars.push(`--${kebab(k)}:${v}`);

  for (const [k, v] of Object.entries(space)) vars.push(`--space-${k}:${v}px`);

  for (const [k, v] of Object.entries(radius)) vars.push(`--radius-${k}:${v}px`);

  for (const [k, v] of Object.entries(shadow)) vars.push(`--shadow-${k}:${v}`);
  vars.push(`--font-sans:"${font.sans}",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`);
  vars.push(`--font-lora:"${font.serif}",Georgia,serif`);

  return `:root{${vars.join(";")}}`;
}
