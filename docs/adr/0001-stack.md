---
status: accepted
---

# Stack: TypeScript monorepo with an Expo app, a Hono API on Cloudflare Workers, a Durable Object per journey, D1, and a TanStack Start site

Cage needs an iOS and Android app with background location, a check-in call and alternate app icons. It needs a server that keeps a journey's timers running when the phone is off or taken (see "The server's job" in `docs/PRD.md`). It also needs a website the safety circle opens from an SMS or Zalo link without installing anything (canvas screens 21 to 25). We chose TypeScript everywhere, on tools Jaden already uses, and kept the server on Cloudflare so the code, the timers and the data sit with one provider.

| Part | Choice |
| --- | --- |
| Repo | Bun workspaces with Turborepo. Bun is the package manager and script runner only. Nothing runs on Bun in production. |
| App (`apps/mobile`) | Expo (React Native) with development builds, not Expo Go |
| API (`apps/api`) | Hono on Cloudflare Workers |
| Journey state and timers | One Durable Object per active journey |
| Database (`packages/db`) | Cloudflare D1, with the schema and migrations in Drizzle |
| Website for the safety circle (`apps/web`) | TanStack Start on Cloudflare Workers |
| Shared code | `packages/shared` (zod schemas, types and domain rules such as timer lengths and the escalation ladder order) and `packages/ui-tokens` (design system tokens from the canvas) |
| Alerts | APNs and FCM called directly, a Vietnamese brandname SMS provider (eSMS or Stringee), Zalo ZNS |
| Infrastructure | Wrangler config per Worker, deployed by Workers Builds from the Cloudflare dashboard (changed from Terraform on 2026-11-04; see `docs/deploy.md`) |
| Tests | Vitest. The API and Durable Objects run in Cloudflare's Workers test pool. |

## How the parts fit

- **The journey's Durable Object** gets the phone's location and battery updates and keeps the live journey in its own storage. Its alarm runs the missed-update, missed check-in, arrival-plus-buffer and escalation-ladder timers, so they run whether or not the phone is reachable. It pushes live location to the website over a WebSocket. When the journey ends its location data is deleted, unless the user saved the journey to the journal.
- **D1** holds the low-traffic records: accounts, safety circles, settings, saved journal entries and alert history. Anything that must outlive a journey is written there on purpose.
- **The app and the website** call the API through Hono's typed RPC client, so `packages/shared` is the one definition of every request and response.
- **The check-in call** is a small native module of our own: CallKit with VoIP push on iOS, a full-screen intent notification on Android. That is why push goes straight to APNs and FCM and not through Expo's push service. Disguise mode uses an Expo config plugin for alternate app icons.
- **Background location** uses Transistorsoft's `react-native-background-geolocation` (paid licence) instead of `expo-location`, because it is more reliable on the low-cost Android phones that kill background apps.

## Considered options

- **Neon Postgres instead of D1.** The hot data (updates every 30 to 60 seconds, timers) lives in Durable Objects, so the database sees little traffic and SQLite is enough. D1 saves us Hyperdrive, a second vendor and a second data-protection review, and Durable Objects already use SQLite, so there is one SQL dialect everywhere. We give up PostGIS (geo checks run in the journey's Durable Object anyway) and multiple writers. Drizzle keeps a later move to Postgres manageable.
- **Cloud Run with Cloud Tasks** for the server. Each journey's timers would be separate tasks to schedule, cancel and keep in step with the database. A Durable Object holds a journey's state and its next alarm together.
- **Flutter, or native Swift and Kotlin,** for the app. Flutter means a new language, and two native apps double the work. The native pieces (check-in call, background location) are small enough to write as Expo modules.
- **Expo web** for the website. The safety circle's screens are not the traveller's screens, so there is little to share, and a separate site loads faster on a cheap phone opened from an SMS link. TanStack Start renders on the server, so the first screen shows before the JavaScript loads.
- **pnpm** as the package manager. Bun is faster and Expo, EAS Build and Turborepo support it. If Expo has trouble with Bun's isolated installs, switch Bun to hoisted installs.

## Consequences

- **CallKit is not allowed in apps on China's App Store**, and the China border is one of the threat routes. On iOS there, the check-in call falls back to a time-sensitive notification. Apple also requires every VoIP push to report a call to CallKit, so a check-in push must always show the check-in call.
- **Data protection:** Vietnam treats location as sensitive personal data (Decree 13/2023 and the personal data protection law). D1 offers no Vietnam or Asia-Pacific jurisdiction, only a location hint, so hosting may need a cross-border transfer impact assessment. This needs a legal check before launch and could force a move of the database.
- A live journey's data exists only in its Durable Object, not in D1. Reporting across journeys needs data that was saved to D1 on purpose.
