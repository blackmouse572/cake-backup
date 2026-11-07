# Deploying

Infrastructure is the Wrangler config of each Worker (`apps/api/wrangler.jsonc`, `apps/web/wrangler.jsonc`). There's no Terraform. Cloudflare Workers Builds (the Git integration in the Cloudflare dashboard) deploys staging on every push to `main`. GitHub Actions only checks the code.

| Environment | API Worker | Website Worker | D1 | Deployed by |
| --- | --- | --- | --- | --- |
| local | `localhost:8787` | `localhost:3000` | local (`cage`) | `bun run dev` |
| staging | `cage-api-staging`, `api-staging.cage.vn` | `cage-web-staging`, `staging.cage.vn` | `cage-staging` | Workers Builds, on push to `main` |
| demo | `cage-api-demo`, `cage-api-demo.<account>.workers.dev` | `cage-web-demo`, `cage-web-demo.<account>.workers.dev` | `cage-demo` | by hand, `bun run deploy:demo` |
| production | `cage-api-production`, `api.cage.vn` | `cage-web-production`, `cage.vn` | `cage-production` | not yet (#38) |

Wrangler creates the custom domains, with their DNS records and certificates, on deploy from the `routes` in each config. The hostnames sit one level under `cage.vn` on purpose: Cloudflare's free Universal SSL certificate covers `*.cage.vn` but not `*.staging.cage.vn`.

Workers Builds doesn't wait for GitHub CI. A push to `main` that breaks the build fails the deploy and leaves the previous version running. A push that passes the build but fails CI still deploys to staging.

## Staging is private

Staging is for the team and testers, and its log can hold sign-in codes (see Logging below), so all of it sits behind Cloudflare Access:

- People open it in a browser after a one-time PIN sent to an allowed email.
- Development builds of the app send an Access service token on every request (`CF-Access-Client-Id` and `CF-Access-Client-Secret`, from `EXPO_PUBLIC_CF_ACCESS_*`; see `apps/mobile/src/auth.ts`). The token is baked into those builds, so treat it as a staging-only key, and rotate it if a build leaks.
- The website calls the API through a service binding, which doesn't pass through Access.
- `workers_dev` and `preview_urls` are off, so no `*.workers.dev` address gets around Access.

Journey routes have required sign-in since #9, so opening staging up is a product decision, not a security gap: remove the Access application, not the Workers.

## Hackathon demo

A separate demo server (`--env demo`, its own D1 `cage-demo`) for showing Cage on stage. The presenter signs in on their own phone with the demo build of the app, sets up their circle and codes, and starts a real trip. The dashboard at `https://cage-web-demo.<account>.workers.dev/demo` (canvas page "Demo dashboard", D1 to D4) then picks that trip and sets its states: it walks the traveller along a fake route instead of the phone's GPS (an emulator's GPS can't move), asks "are you safe?", lets the answer time run out, or makes the phone go quiet. The safe code and the duress PIN are only typed on the phone; the dashboard has no way to send one. The right column is the circle's real page.

Guards, all in `apps/api/src/controllers/demo.controller.ts` unless noted:

- `/demo` answers 404 unless `DEMO_MODE=on`, `MESSAGE_SENDER` is `console` or `none`, and `DEMO_KEY` is set. So the demo server never texts or calls anyone, even though the circle holds real people's numbers: every message is only logged, and the dashboard shows that log.
- Every `/demo` call needs `DEMO_KEY` in `x-demo-key`; the presenter types it on the dashboard. Five wrong keys lock that caller (a hash of their IP) out for 15 minutes.
- `DEMO_ACCOUNTS` (comma-separated E.164 numbers) limits the dashboard to those accounts. Unset, it shows every trip on the demo server.
- A test fails if `staging` or `production` in `apps/api/wrangler.jsonc` ever sets `DEMO_MODE` (`test/wrangler-config.test.ts`).
- The demo build of the app and the circle page wear a DEMO pill, and the circle page's call and message buttons are off.

Once, from `apps/api`, logged in with `bunx wrangler login`:

```sh
bunx wrangler d1 create cage-demo --location apac   # put the id under env.demo in wrangler.jsonc
bun run db:migrate:demo
bun run deploy:demo                                  # prints the API's workers.dev URL, for the phone
bunx wrangler secret put BETTER_AUTH_SECRET --env demo   # openssl rand -base64 32
bunx wrangler secret put CODE_PEPPER --env demo
bunx wrangler secret put DEMO_KEY --env demo             # openssl rand -hex 8; the presenter types it
bunx wrangler secret put DEMO_ACCOUNTS --env demo        # e.g. +84912345678 (optional)
cd ../web && bun run deploy:demo                         # prints the dashboard's workers.dev URL
```

To redeploy after a change, run the two `deploy:demo` commands again (and `db:migrate:demo` if a migration was added). To take it down, `bunx wrangler delete --env demo` in each app. Sign-in codes on the demo server go to its log (`bunx wrangler tail --env demo` in `apps/api`).

### The demo phone

The demo build is the normal app with a DEMO pill and a 2-second refresh. It needs no new native modules, so the existing development build runs it. From `apps/mobile`:

```sh
EXPO_PUBLIC_DEMO=on EXPO_PUBLIC_API_URL=https://cage-api-demo.<account>.workers.dev bunx expo start
```

Locally, `bun run dev` in `apps/web` serves the dashboard at `http://localhost:3000/demo` (key: `DEMO_KEY` in `apps/api/.dev.vars`), and an Android emulator reaches the API with `EXPO_PUBLIC_API_URL=http://10.0.2.2:8787` while `bunx wrangler dev --persist-to ../web/.wrangler/state` runs in `apps/api`.

## Data location (for the privacy review, #34)

The databases are created with `--location apac`, which places the D1 primary in Cloudflare's Asia-Pacific region, the closest to Vietnam. It's a hint, not a guarantee. D1 has no Vietnam or APAC jurisdiction (only `eu`, `us` and `fedramp`), so data does leave Vietnam. Durable Objects (live journey state) are created near the first request that reaches them, so Vietnamese users' land in APAC too. Passing `locationHint: "apac"` when the API gets a journey's stub would make that explicit. Decree 13's cross-border transfer paperwork has to cover both.

## Logging and error reporting

Both Workers have Workers Logs and Workers Issues on. Issues groups errors and sends alerts in the dashboard. Invocation logs are off and query strings are redacted, because invocation logs record request headers, including the caller's IP. The API writes one line per request (`apps/api/src/middleware/request-log.ts`) with the method, the matched route pattern, the status and the duration, and it logs uncaught errors with their stack. It never logs a body, header, IP, phone number or location.

One exception on staging: until the Zalo and SMS settings are in (`docs/messaging.md`, step 5), `MESSAGE_SENDER=console` writes sign-in codes and phone numbers to the staging log so testers can sign in. Production uses `zalo+sms` and never the console sender.

## Setting up staging (once)

1. **Domain.** Add `cage.vn` to the Cloudflare account and point the registrar's nameservers at Cloudflare.
2. **Databases.** From `apps/api`, logged in with `bunx wrangler login`:
   ```sh
   bunx wrangler d1 create cage-staging --location apac
   bunx wrangler d1 create cage-production --location apac
   ```
   Put each `database_id` under `env.staging` and `env.production` in `apps/api/wrangler.jsonc`, and commit. Ids are not secrets.
3. **First deploy**, which creates the Workers that Workers Builds attaches to:
   ```sh
   cd apps/api && bun run db:migrate:staging && bun run deploy:staging
   cd ../web && bun run deploy:staging
   ```
4. **Worker secrets.** Use different values per environment, generated with `openssl rand -base64 32`:
   ```sh
   cd apps/api
   bunx wrangler secret put BETTER_AUTH_SECRET --env staging
   bunx wrangler secret put CODE_PEPPER --env staging
   ```
   Changing `CODE_PEPPER` later makes every stored safe code and duress PIN unusable, so set it once.
5. **Cloudflare Access** (Zero Trust in the dashboard; the free plan covers 50 users):
   - Under Service credentials, create a service token named `cage-staging-dev-builds`. Keep its client id and secret for step 7.
   - Under Applications, add a Self-hosted application "Cage staging" with the public hostnames `staging.cage.vn` and `api-staging.cage.vn`. Give it two policies: a Service Auth policy that includes the service token, and an Allow policy that includes the team's emails (sign-in by one-time PIN). Under the application's settings, turn on "Return 401 response for Service Auth policies" so the app gets a 401 instead of a login page.
6. **Workers Builds.** In Workers & Pages, open each staging Worker, go to Settings > Build, and connect `blackmouse572/cage`:

   | Setting | `cage-api-staging` | `cage-web-staging` |
   | --- | --- | --- |
   | Production branch | `main` | `main` |
   | Root directory | `apps/api` | `apps/web` |
   | Build command | (none) | (none) |
   | Deploy command | `bun run db:migrate:staging && bun run deploy:staging` | `bun run deploy:staging` |
   | Build watch paths | `apps/api/*`, `packages/*`, `bun.lock` | `apps/web/*`, `apps/api/*`, `packages/*`, `bun.lock` |
   | Preview builds | off | off |

   Workers Builds installs dependencies with Bun, since `bun.lock` and `packageManager` select it. It runs the D1 migrations before the API deploy, so new code never runs against an old schema. Keep migrations additive, because the old Worker keeps serving until the deploy finishes. Preview builds stay off because preview URLs are off.
7. **EAS.** In the Expo project, add the `development` environment variables `EXPO_PUBLIC_CF_ACCESS_CLIENT_ID` and `EXPO_PUBLIC_CF_ACCESS_CLIENT_SECRET` from step 5. Then run `cd apps/mobile && eas build --profile development`.

## Secrets and variables

| Name | Where | Used by |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | Worker secret on `cage-api-staging` (later `-production`) | sessions |
| `CODE_PEPPER` | Worker secret, same | safe code and duress PIN hashes |
| `EXPO_PUBLIC_CF_ACCESS_CLIENT_ID`, `EXPO_PUBLIC_CF_ACCESS_CLIENT_SECRET` | EAS environment `development` | development builds |

Workers Builds authenticates with the Cloudflare account it runs in, so GitHub needs no Cloudflare token.
