# Cage: product requirements

Status: draft, 3/11/2026. Source: the [Cage concept doc](https://claude.ai/artifact/MeUFLFamAMeiHLnV32xxtS) and the [design canvas](https://doop.design/c/2v_tmcapn2). Terms follow `GLOSSARY.md`.

## Problem

People travelling for a job, study or a relationship, often away from home for the first time, are targeted by traffickers who are usually someone they trust. When something goes wrong, the victim may not be able to ask for help, and their phone may be checked, taken or switched off.

Cage watches over a journey and quietly brings in trusted people when something goes wrong.

## Users

- **Travellers (primary):** Vietnamese people aged roughly 16 to 30 travelling for work, study or a relationship.
- **Safety circle (secondary):** usually family. They receive alerts and follow trips, and don't need to install the app.
- Anyone can use Cage for an everyday trip home. The trafficking-specific features (disguise, pre-trip check, NGO contacts) set it apart from a generic safety app. Vietnam first, built to expand to other countries.

## Threats designed against

| Pattern | How it starts | What Cage does |
| --- | --- | --- |
| Fake job offers abroad (scam compounds in Cambodia, Myanmar, Laos) | Well-paid job ad on Facebook or Zalo, travel arranged by the "employer" | Pre-trip offer check, track the cross-border leg, alert family early |
| Cross-border bride trafficking to China | A boyfriend, relative or broker in the northern border provinces | Journey tracking, silent SOS, disguise mode |
| Debt-based labour migration (Europe, Taiwan, Japan, Korea) | A broker charges large fees, then takes the passport | Secure copy of ID documents, NGO contacts at the destination |
| Everyday travel at night | A walk or ride home | The core journey and check-in loop |

These patterns are from general knowledge and still need checking against sources.

## Core flow

1. **Set up the circle** (screen 05): pick trusted contacts, the check-in window, the safe code, the duress PIN and who gets alerted.
2. **Plan the journey** (01): destination, travel mode (auto-detected), expected arrival.
3. **Travel** (02): live progress, the circle can follow, SOS is one tap away.
4. **Something looks wrong** (03): the user goes off route, stops too long or misses the arrival time. Cage asks "are you safe?" in the app, or with a check-in call if the screen is locked.
5. **Escalate** (04): no answer or the duress PIN sends live location to the circle first, then up the escalation ladder.
6. **Review** (06, 07): a journal timeline of the trip that can be shared as evidence.

## Requirements

### Check-in call
- When the screen is locked, Cage shows a full-screen, call-style alert rendered by the app (CallKit on iOS, full-screen notification on Android). It is not a real phone call and costs nothing on the telecom network.
- The caller name looks ordinary ("Mẹ", "Công ty"), with a vibrate-only option.
- Answering is not enough. The user confirms with the safe code, because someone else may answer.
- One missed call is not "in danger". Cage retries after 1 to 2 minutes, then escalates.
- Later option: a real call over a voice API (for example Stringee or Twilio) when there is no data.

### Duress PIN
- Works in the app and on the check-in call.
- Looks exactly like "I'm safe" in the UI, timing and network behaviour, while sending the alert quietly.

### Wrong codes on a journey
- Five wrong codes on a journey (check-ins and ending it share the count) lock every code for 5 minutes, the safe code and the duress PIN included, so whoever holds the phone can't quickly try codes until one works. During a check-in they also count as no answer and alert the circle.
- The count starts again once 5 minutes pass without a wrong code.
- The lock outlasts a check-in's 3-minute window on purpose: a check-in that comes while the codes are locked can't be answered and alerts the circle.

### Forgot code ("Quên mã?")
- During a journey there is no way to reset the codes. The code screen says so: let the time run out and Cage tells the circle (screen 26). Otherwise whoever holds the phone could take the codes over mid-journey.
- Outside a journey the traveller resets both codes with a new sign-in code to their phone (Zalo or SMS) instead of the current safe code. The server takes the reset only from a session created in the last 10 minutes, so an old session alone is not enough. Right after signing in on a new phone (08c), the code just verified counts.
- Both codes are set again together, with the same rules as the first time, and the old ones stop working. The wrong-try lock is cleared.
- Limit: someone holding the phone and SIM before a journey can reset the codes too. So a reset sends the circle a quiet heads-up (decided 2026-11-04, #48): one short message to every contact (Zalo first, SMS fallback) in the traveller's language, saying the traveller reset their codes in Cage and asking them to call and check if the traveller hasn't mentioned it. It never says which code or the new codes, and carries no link. It goes out after the reset is saved, so a failed message never undoes the reset. There is no extra limit on these messages: each reset needs a fresh sign-in code, and those are capped per number.

### Lost contact
- When the phone goes silent, Cage waits until the expected arrival time plus a buffer (about 20 minutes) before acting.
- Every location update carries the battery level. A phone that died at low battery gets a calm "phone probably died" message to the circle.
- Silence alone only reaches the circle, never police or hotlines.
- The user can cancel from another device or by SMS code, and a circle member can mark that they reached the user.
- Can be turned on per trip, for risky journeys only.

### Escalation ladder
- Safety circle first, then a hotline or NGO (Tổng đài 111, Blue Dragon), then police (Công an 113) only if the user turned it on. For migrants or people without papers, police can be risky.
- Ask for at least two circle contacts, ideally in different places. If nobody opens the alert within 10 minutes, Cage calls them, then moves to the hotline.
- Contacts are picked from the phone book (only the people ticked leave the phone) or typed in. One contact is allowed but the app nudges for a second; the circle holds at most 10, each number once, never the traveller's own. The order on screen is the order they are told in.

### SOS and fake call
- SOS is always one tap away during a journey.
- A fake incoming call helps the user leave an uncomfortable situation.

### Disguise mode
- Neutral app name and icon (for example a notes app), quiet notifications, a quick-hide gesture and a decoy screen, because a trafficker may check the phone.

### Pre-trip check (post-MVP)
- Before a long or cross-border trip: who arranged it, does the user hold their own passport, is the employer real. Cage flags common scam signs.
- Stores encrypted copies of ID documents, the destination country's hotline and the nearest Vietnamese embassy.

### Live map for the circle
- The circle gets an SMS and Zalo message with a web link to a live map. Installing the app is optional and gives richer alerts.
- Maps are drawn with MapLibre in the app and on the website. Place search and motorbike routes come from Goong in Vietnam, called only through our API so the provider can change and searches carry no identity ([ADR 0004](adr/0004-maps.md)).

### Accounts and sign-in
- Travellers register and sign in with their phone number and a one-time code (Zalo first, SMS as fallback). No password, no email.
- Safety circle contacts don't need an account. Their link opens only that journey and stops working when it ends.
- Once signed in, the app stays signed in. It never opens on a sign-in screen, which would give it away in disguise mode.
- A session alone can't cancel an alert or end a journey. Both need the safe code, and the duress PIN works there too.
- Signing out needs the safe code too (screen 20), so a thief holding a signed-in phone can't sign out to stop the alerts. The duress PIN gets exactly the same answer and the phone signs out, but the server keeps the session. Raising an alert for that PIN while a journey is open comes with the alert engine (#22), as it does for changing the codes. A traveller with no codes yet may sign out without one. The server answers Better Auth's own sign-out and revoke-session routes with 404, so the code can't be skipped.
- Settings (screen 20): the safety circle, changing the codes (the current safe code, then both new codes), the language and the police switch (off by default: for people without papers, police can be a risk). The check-in call (14) and disguise (18) rows show "coming soon" until those screens exist.
- How it is built: [ADR 0002](adr/0002-sign-in.md).

## The server's job

A phone that is off or unreachable cannot raise its own alarm, so the server is the one that notices the silence.

1. **Holds the trip.** When a journey starts, the phone sends the route, mode and expected arrival time.
2. **Receives updates.** During the trip the phone sends location and battery level every 30 to 60 seconds, less often when the user isn't moving.
3. **Runs the timers.** Missed update, missed check-in and arrival plus buffer are checked on the server, so they keep running when the app is closed or the phone is dead.
4. **Wakes the phone.** For a check-in it sends a push that opens the call-style alert, even when the app is closed.
5. **Alerts the circle.** SMS and Zalo messages with a live map link, then the hotline step if nobody responds.
6. **Serves the live map** in a browser.
7. **Cleans up.** Location data is deleted after the trip unless the user saves it to the journal.

The server is the most sensitive part of Cage because it knows where users are. It needs encryption, strict access control and as little stored data as possible.

## Privacy and safety principles

- **Assume the phone will be seen by the wrong person.** Nothing on screen, in notifications, or in the app name and icon (in disguise mode) should give the user away.
- **Collect as little as possible.** Location is shared only during a trip or an alert. Trip history deletes itself after a set time unless the user saves it.
- **The user stays in control.** They choose who is in the circle and whether police are ever contacted.
- **False alarms cost trust.** Every automatic alert has a grace period and a way to cancel.
- **Saved evidence is protected.** Trip logs and ID copies are encrypted and shared only on purpose, for example with an NGO.
- **Follow local law.** Vietnam's Personal Data Protection Law (91/2025/QH15, in force since 1 January 2026, replacing Decree 13/2023) treats location as sensitive data, so Cage needs an impact assessment, a data protection officer and a transfer assessment for Cloudflare. Whether the 2025 Cybersecurity Law requires storage in Vietnam is open. See [privacy-review.md](privacy-review.md).

## Non-functional requirements

- All copy in Vietnamese first, English second. The app follows the phone's language on first launch (Vietnamese unless the phone is set to English) and the user can switch at any time. The circle's website, the check-in call and alert messages use the traveller's language ([ADR 0003](adr/0003-i18n.md)). That language is saved on the server (`traveller_settings.locale`): the app sends it whenever the traveller changes it and before each journey starts, and the server takes it from there, not from the journey request.
- Background location: high accuracy only during an active trip, lower update rate when not moving. Test early on cheap Android phones, which kill background apps aggressively.
- Every safety feature is free for users.

## MVP scope

| Feature | MVP | Later |
| --- | --- | --- |
| Phone number sign-in | Yes | Zalo, Google or Apple sign-in |
| Safety circle, journey, off-route check-in, alert | Yes | |
| Check-in call with safe code | Yes | |
| Duress PIN | Yes | |
| SOS and fake call | Yes | |
| Lost-contact rule with battery level | Yes | |
| Disguise mode | Basic (icon and name) | Quick-hide, decoy screen |
| Hotline and NGO contacts | Vietnam only | Other countries |
| Pre-trip check and job-offer scam signs | | Yes |
| Encrypted ID document vault | | Yes |
| Journal history and evidence export | Tonight only | Full history |

The MVP proves the journey loop works and that people trust its alerts.

## Open questions

| Question | Current suggestion |
| --- | --- |
| Keep the name "Cage"? | Keep it as the brand but never show it on the phone in disguise mode. Test with Vietnamese users, since "cage" can read as trapped. |
| Which NGOs and hotlines? | Use 111 as the default hotline: since Decree 162/2025 it is also the national anti-trafficking line, 24/7. Contact Blue Dragon and Pacific Links before listing them. Start by showing numbers to the circle; build direct alerts once one NGO signs a data sharing agreement. See [hotlines.md](hotlines.md). |
| Must Cage store data in Vietnam? | Ask a lawyer whether the 2025 Cybersecurity Law covers Cage. Cloudflare can't keep data in Vietnam, so a yes changes ADR 0001. See [privacy-review.md](privacy-review.md). |
| What changes across borders? | The pre-trip check stores the destination hotline and nearest embassy. SMS cancel codes may not work abroad, so warn the user. |
| Who pays? | Fund through grants and NGO partnerships first; later an optional paid family plan with extras such as longer history. |
| Stack | Decided in [ADR 0001](adr/0001-stack.md). |
