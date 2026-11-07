---
status: accepted
---

# Sign-in: phone number and one-time code with Better Auth, no accounts for the safety circle

Travellers register and sign in with their phone number and a one-time code. Most of them have a phone number and Zalo, and many don't use email. Auth runs in our own API with Better Auth (Hono on Workers, D1 through its Drizzle adapter), so accounts sit in the same database as everything else and no outside identity provider holds them.

## How it works

- **Register and sign in:** phone number, then a 6-digit code sent by Zalo ZNS (cheaper) with SMS as the fallback, through the same providers as alerts (ADR 0001). Better Auth's phone-number plugin handles the codes. There is no password and no email. Code requests are rate limited per number and per IP, with Cloudflare Turnstile on the website, because every code costs money.
- **The app:** Better Auth's Expo client keeps the session in the device's secure storage, and the session lasts a long time and refreshes quietly. A journey must never stop because a session expired, so during an active journey the app sends updates with a **journey token** that is issued when the journey starts and ends with it.
- **The safety circle has no accounts.** The SMS or Zalo link carries a token signed for that contact and that journey. It only opens that journey's website pages (canvas screens 21 to 25) and stops working when the journey ends or the traveller removes the contact. A contact who installs the app registers like any traveller.
- **The safe code and duress PIN are not login secrets.** They are set during circle setup, stored only as hashes on the server, and checked on the server, so both take the same time and produce the same response (PRD, "Duress PIN"). A session alone can't cancel an active alert or end a journey. Both need the safe code.
- **Disguise mode:** the app never opens on a sign-in screen. Once signed in it stays signed in, and in disguise mode it opens on the decoy screen. Code messages don't name Cage, for example "Mã xác nhận của bạn là 123456".

## Considered options

- **Firebase Auth or Clerk.** Both do phone codes, but accounts would then live with a second provider outside Cloudflare, which adds to the data-protection review, and their SMS costs to Vietnam are higher.
- **Sign in with Zalo, Google or Apple.** It may come later as an extra option. Phone number stays the main identity, because the circle and the alerts are phone-based.
- **Accounts for safety circle contacts.** Asking a worried parent to register before seeing an alert would slow the moment that matters most.

## Consequences

- Whoever holds the traveller's phone and SIM can sign in. That's why cancelling an alert or ending a journey needs the safe code, and why the duress PIN works there too.
- A forgotten safe code is reset with a fresh sign-in code (`PUT /me/codes/reset` takes only a session created in the last 10 minutes), never during an open journey (PRD, "Forgot code").
- A forwarded circle link shows the journey to whoever opens it. The link only lasts as long as the journey and can be revoked. Asking contacts to confirm with a code would make it safer but slower, so we left that out for the MVP.
