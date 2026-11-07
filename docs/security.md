# Security review

The first pass of the security review in #31, done on 7 November 2026 against `main` at `5618d54`. It covers what #31 asks for, plus the clean-up after the malware pushed into `cage` and `cake-backup` the same day. Fixed items link to the change that fixed them. Everything else is either a setting that only an owner can change in GitHub or Cloudflare, or an accepted risk with a reason.

## The malware of 7 November

A stolen credential force-pushed an obfuscated `commitlint.config.js`, `init` scripts at the root and in `apps/api`, `apps/web` and `apps/mobile`, `node init &&` in front of the `dev` and `build` scripts, and `config.bat` in `.gitignore`. In this repo it arrived with the import commit `fa96edf` and was removed by `7272ce0` half an hour later.

What was checked:

- Every branch tip and every pull request head on GitHub: no `init` file, no `.vscode/`, no font-named `.js` file, no `node init`, no JavaScript or JSON line over 2,000 characters, and the same `commitlint.config.js` as `main`.
- The only GitHub Actions run on an infected commit (CI run 1, on `fa96edf`) failed at lint, before the build step, so `node init` never ran in CI. The commit-message workflow only runs on pull requests and none was open on that commit.
- Workers Builds runs `wrangler deploy` and `vite build` directly, not the `build` script, so it would not have run `node init` either. Check the build history anyway (below).
- No package in `bun.lock` comes from outside the npm registry, there are no git dependencies and no `trustedDependencies`, so Bun runs no dependency install scripts.
- `bun audit` reports three moderate advisories, all in dev tools (esbuild's dev server, and `glob` and `minimatch` under Expo's fingerprinting). None of them ships in a Worker or the app. Accepted until those tools update.

The infected files are still in the history (`fa96edf`). Checking out that commit and running `bun install` or a `git commit` would load the payload again: `commitlint.config.js` runs on every commit through the commit-msg hook. Don't check out commits from before `7272ce0`. Rewriting `main` to remove it would break every open branch, so it stays.

Anyone who committed, or ran `bun run dev` or `build`, in a checkout of an infected commit should treat that machine as compromised. Look for `config.bat` and `init` files in the checkout, and rotate whatever that machine was signed in to.

## Fixed in this change

| Finding | Fix |
| --- | --- |
| **A session could move the account to another phone number.** Better Auth's `POST /auth/phone-number/verify` with `updatePhoneNumber: true` changes the signed-in account's number to any number its caller has a code for. Whoever holds the traveller's unlocked phone could put their own number on the circle's page, so a contact who taps "call" reaches them, and from then on sign-in codes go to them. | Refused in `apps/api/src/auth.ts`; tested in `test/auth.test.ts` (without the fix the number changes). |
| **Every Better Auth route was open.** Only the sign-out and revoke routes were closed. Password sign-in and reset, `update-user`, `delete-user`, `list-sessions` and the others answered, even though the app uses none of them. | `/auth/*` now serves only `send-otp`, `verify` and `get-session` (`AUTH_ROUTES` in `constants.ts`); everything else answers 404. |
| **No limit on starting journeys.** Each start messages every circle contact, and the traveller picks both the numbers and the destination text that goes into the message. A signed-in account could send unlimited messages from Cage's sender to anyone. | 10 starts per traveller per hour (`JOURNEY_STARTS`), then 429 `rate_limited`. |
| **CI tokens could write.** The workflows had no `permissions`, and checkout left the token in `.git/config` for every later step, including `bun install` and the builds. | `permissions: contents: read`, `persist-credentials: false`. |
| **Actions were pinned by tag.** Whoever controls a tag can move it. | `actions/checkout` and `oven-sh/setup-bun` pinned to commit SHAs; Dependabot keeps the pins current (`.github/dependabot.yml`). |
| **No owner review on files that run code.** | `.github/CODEOWNERS` covers workflows, package manifests, the lockfile, hooks, Wrangler and Vite configs, lint rules and agent skills. It takes effect once the branch rule below asks for code owner review. |

## Settings only an owner can change

GitHub, for `cake-backup` (and `cage` while it's still used):

1. **Protect `main`** with a ruleset (Settings > Rules > Rulesets > New branch ruleset, target `main`): block force pushes, block deletion, require a pull request with one approval and code owner review, require the `check` and `pr-title` status checks, and require linear history. This alone would have stopped the force push.
2. **Require signed commits** in the same ruleset, after everyone has set up SSH or GPG signing and marked the key "Signing key" on GitHub. Squash merges made on GitHub are signed by GitHub.
3. **Actions settings** (Settings > Actions > General): workflow permissions "Read repository contents", untick "Allow GitHub Actions to create and approve pull requests", and "Require approval for all outside collaborators" for fork pull requests.
4. **Two-factor authentication** for every collaborator, with passkeys or an authenticator app rather than SMS. Remove collaborators who no longer need access.
5. **Tokens**: replace classic personal access tokens with fine-grained ones limited to these repos and an expiry date, and review Settings > Applications on each account for OAuth apps and GitHub Apps nobody recognises.
6. **Security features** (Settings > Code security): turn on secret scanning with push protection, and Dependabot alerts.

Cloudflare:

7. **Workers Builds history**: in each staging Worker, open Deployments and Builds and check that nothing was built or deployed from `fa96edf` (7 November, 07:40 to 08:09 UTC). If something was, rotate `BETTER_AUTH_SECRET` and `CODE_PEPPER` on that Worker.
8. **Account access**: two-factor authentication for every member, and API tokens scoped to one account with an expiry. Remove tokens that were on the compromised laptop.

## Reviewed and fine

- **Ownership.** Every journey route checks that the journey belongs to the session's traveller (`journeysService.owned`) before it reaches the Durable Object; a stranger's id answers 404. Location updates need the journey token, and the Durable Object compares its hash in constant time. The circle's `GET /links/:token` needs the link, and the link dies when the journey ends or the contact leaves the circle.
- **Tokens.** Journey tokens carry 256 random bits and circle links 128, from `crypto.getRandomValues`. Only their SHA-256 is stored. They are random, not signed, so there is no signing key to rotate: #31's rotation subtask doesn't apply. Guessing either is not feasible, so neither needs a rate limit.
- **Codes.** The safe code and duress PIN are HMAC-SHA256 with a per-code salt and the `CODE_PEPPER` secret, compared in constant time, with the same work whether a hash exists or not. Journey codes lock after 5 wrong tries for 5 minutes; changing codes allows 5 wrong tries per 15 minutes. Sign-in codes: 6 digits, 5 minutes, 5 tries, 5 codes per number per hour, plus Better Auth's per-IP limits keyed on `cf-connecting-ip`.
- **Sign-out.** A session alone can't end itself; `POST /me/sign-out` needs the safe code. The tests also cover other spellings of the sign-out path.
- **Maps.** `/places` and `/routes` need a session and are limited to 60 calls a minute per traveller. `near` is rounded to about 1 km before it goes to Goong. The Goong key stays on the server.
- **Logs.** The request log writes the route pattern, never the URL, body, headers or IP. Invocation logs are off and query strings are redacted. Delivery logs hold the kind, channel and result, not the number or text.
- **The circle's page** sends `noindex` and `no-referrer`, so the link doesn't leak to the map tile servers or search engines.
- **The demo** answers 404 unless `DEMO_MODE` is on and the message sender sends nothing, and it locks a caller out after 5 wrong keys.
- **CI** uses `pull_request`, never `pull_request_target`, and passes the PR title through an environment variable, never into the script.

## Accepted risks

| Risk | Why it's accepted, and until when |
| --- | --- |
| A forwarded circle link shows the trip, the traveller's number and their live location to whoever has it. | The link is how a contact without the app sees the trip. It dies when the journey ends. Revisit before the pilot: a short lifetime after an alert ends, or a check that it's opened from the contact's own number. |
| With `MESSAGE_SENDER=console`, staging and the demo write each message's number, text, sign-in code and circle link to Workers Logs. | That's how the team signs in until Zalo and SMS are set up, and staging sits behind Cloudflare Access with test accounts. It must be off (a real sender) before any real traveller uses staging. |
| Sessions last a year. | Opening on a sign-in screen would give the app away in disguise mode, and the safe code guards sign-out. Rotating `BETTER_AUTH_SECRET` signs everyone out. |
| `CODE_PEPPER` has no version, so rotating it invalidates every saved code. | Fine while there are no real users. Add a pepper version to the hash string before the pilot. |
| The staging Cloudflare Access service token is an `EXPO_PUBLIC_` variable, so it's inside every development build. | Anyone with a development build can reach staging's API. Only the team has those builds. Production never uses it (#34). |
| The demo hashes callers' IPs with plain SHA-256. | IPv4 addresses can be recovered from that, but it's only the demo lockout table, which holds nothing else. |
| Workers rate limiting counts per Cloudflare location, so the maps limit is approximate. | It's there to cap Goong costs, not as a security boundary. |

## Still open in #31

- **A second person reviews the code hashing and the duress path.** That needs a person; this review found nothing wrong in them.
- **Encryption at rest for saved journals.** Journals aren't built yet. When they are, encrypt the stored locations with a key held outside D1, and update this file.
- **Signing-key rotation.** Doesn't apply (see "Tokens" above).
