import type vi from "../languages/vi.json";

type Widen<T> = { -readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** The shape every locale must fill. */
export type Messages = Widen<typeof vi>;

// Typed keys for i18next's `t` and react-i18next's `useTranslation`.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: Messages };
  }
}
