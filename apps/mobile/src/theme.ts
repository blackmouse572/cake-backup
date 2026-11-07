import { color, radius, type as typeScale } from "@cage/ui-tokens";
import type { TextStyle } from "react-native";

/**
 * Text styles from the design tokens. Fonts (Inter, Geist Serif) are not
 * bundled yet, so these fall back to the system font until they are.
 */
export function text(name: keyof typeof typeScale): TextStyle {
  const t = typeScale[name];

  return {
    fontSize: t.size,
    lineHeight: t.lineHeight,
    fontWeight: t.weight,
    letterSpacing: t.tracking * t.size,
    color: color.fgPrimary,
  };
}

export { color, radius };
