# Privacy and data protection review (Vietnam)

Research notes for #30, written 2026-11-07. This is not legal advice. It is a map of the rules that apply to Cage, built from law-firm and press summaries, so a Vietnamese lawyer should check every "must" below against the official texts before launch. Sources are listed at the end, and each claim names the one it comes from.

## Summary

- **Decree 13/2023 no longer governs.** The Personal Data Protection Law (Law 91/2025/QH15) and its Decree 356/2025/ND-CP both took effect on 1 January 2026 and replace it [FPF, VLM].
- **Location is sensitive personal data** under Decree 356 [FPF]. That one fact removes the startup exemptions, so Cage must file an impact assessment, name a data protection officer and follow the extra rules for sensitive data from its first real user.
- **Storing data on Cloudflare is a cross-border transfer.** Neither D1 nor Durable Objects can keep data in Vietnam [CF-D1, CF-DO], so Cage needs a transfer impact assessment filed with the Ministry of Public Security within 60 days of starting [FPF].
- **The biggest open risk is localisation.** The new Cybersecurity Law (Law 116/2025/QH15, in force 1 July 2026) is summarised as requiring enterprises that collect personal data and relationship data of users in Vietnam to store it in Vietnam [EY, HTPL]. If a lawyer confirms that this reaches Cage, the storage part of [ADR 0001](adr/0001-stack.md) has to change. This is the first question for the lawyer.
- **Circle contacts are data subjects too.** They never sign up, so Cage needs a legal basis for keeping their numbers before any alert. The safest route is to tell each contact when they are added and let them opt out.

## The laws that apply

| Law | In force | What it means for Cage | Source |
| --- | --- | --- | --- |
| Personal Data Protection Law, 91/2025/QH15 | 1 Jan 2026 | Consent, rights, impact assessments, cross-border transfers, penalties | [FPF], [TIL], [VLM] |
| Decree 356/2025/ND-CP | 1 Jan 2026 | Details of the law: sensitive data list (includes location), consent forms, assessment dossiers, 100,000-person threshold | [FPF], [VLM] |
| Cybersecurity Law, 116/2025/QH15 | 1 Jul 2026 | Replaces the 2018 Cybersecurity Law and the 2015 Network Information Security Law. Data localisation, details left to a Government decree | [EY], [HTPL] |
| Decree 53/2022/ND-CP | Since 2022, status under the new law unclear | Under the 2018 law: personal data, user-created data (registered phone numbers, IPs) and user relationship data (friends, groups) stored in Vietnam for at least 24 months. Law firms disagree on whether every domestic enterprise is covered | [TIL-53], [FF] |
| Data Law, 60/2024/QH15 | 1 Jul 2025 | Core and important data. Below 10,000 Vietnamese data subjects this is unlikely to matter; above it, check whether the data counts as important | [FPF], [VLM] |
| Law on Prevention and Combat of Human Trafficking 2024, and Decree 162/2025/ND-CP | 2025 | Runs Tổng đài 111 (see [hotlines.md](hotlines.md)) | [BPL] |

## What Cage stores

From `packages/db/src/schema.ts`, `apps/api/src/journey-object.ts` and `docs/messaging.md` as they are on main today.

| Data | Whose | Where | Kept for | Sensitive |
| --- | --- | --- | --- | --- |
| Phone number, name | Traveller | D1 `user` | Until the account is deleted | No |
| Sessions with IP address and user agent | Traveller | D1 `session` | Until the session expires | No |
| Safe code and duress PIN, as hashes only | Traveller | D1 `traveller_settings` | Until changed or deleted | No, but secret |
| Police step on or off, language | Traveller | D1 `traveller_settings` | Until deleted | Possibly: "police off" can hint at a migrant without papers |
| Name and phone number of each contact | Circle contact | D1 `circle_contacts` | Until the traveller removes them | No |
| Destination name, expected arrival, start and end time, status | Traveller | D1 `journeys` | No limit set yet | Destination is location data |
| Live location and battery | Traveller | Journey Durable Object | Deleted when the journey ends (`deleteAll`), unless saved to the journal | **Yes** |
| Circle link hashes | Circle contact | D1 `circle_links` | Deleted with the journey row | No |
| Numbers that asked for a code | Anyone | D1 `code_requests` | No limit set yet | No |
| Message delivery logs, no numbers or text | n/a | Workers logs | Cloudflare's log retention | No |

Processors who see the data: Cloudflare (all of it), Zalo (phone numbers and message text), Twilio in the US (phone numbers and message text), and Apple or Google push services once check-in push ships.

D1 offers location hints (`apac` is the nearest) and jurisdictions only for the EU, the US and FedRAMP. Durable Objects add the `apac-se` hint, which is best effort and covers Southeast Asia as a whole. Neither can pin data to Vietnam [CF-D1], [CF-DO].

## Findings

Each row is a "must" (the law requires it, as far as the summaries go), a "should" (good practice, or protects us while the law is unclear), or a question for the lawyer.

| # | Finding | Level | Source |
| --- | --- | --- | --- |
| 1 | Get a written opinion on whether Law 116/2025 localisation covers Cage, and which decree details it. If it does, plan a Vietnamese storage option for user and circle data (a local database the Worker writes to, or a local provider) and record it in a new ADR | Question, then must | [EY], [HTPL] |
| 2 | Register a legal entity before launch. The startup exemptions, the DPO rule and the filings all assume one, and a lawyer will ask first whether Cage is a Vietnamese enterprise | Must | [FPF] |
| 3 | Prepare the processing impact assessment (DPIA) from the start of processing and submit it to A05, Ministry of Public Security, within 60 days | Must | [VLM] |
| 4 | Prepare the cross-border transfer impact assessment (TIA) for Cloudflare, Twilio and push services and submit it to A05 within 60 days of the first transfer. Update it every six months when something changes, and right away when a provider changes | Must | [FPF], [TIL] |
| 5 | Appoint a data protection officer or unit, or hire an outside one (college degree and two years in law, IT or security). The five-year startup exemption does not apply to sensitive data | Must | [TIL], [VLM] |
| 6 | Sensitive data duties: tell the traveller before collecting location that it is sensitive data, encrypt it in storage and in transit, and write internal rules on who can access it | Must | [FPF] |
| 7 | Consent: one separate, clear consent per purpose (journey tracking, sharing with the circle, hotline step, police step), never pre-ticked, recorded so we can prove it later. A tap on an in-app setting counts as a valid form | Must | [FPF], [VLM] |
| 8 | Circle contacts: the law protects their numbers too, and no source says storing a third party's number is fine without notice. Send each new contact a short notice with an easy opt-out (draft below), and ask the lawyer whether that is enough or whether the contact must agree | Should, then question | [TIL] |
| 9 | The emergency basis (protecting life and health "in urgent cases", PDPL Art. 19.1) covers sending location to the circle and a hotline during an alert. It is not a reason to keep data longer, and it may not cover third parties | Question | [FPF], [TIL] |
| 10 | Breach plan: report to A05 within 72 hours of finding a breach | Must | [TIL] |
| 11 | Children: data of a child needs a parent's consent, and a child aged 7 or older must also agree. The age that counts as a child is not in the summaries. Until the lawyer answers, set the minimum age to 16 in the terms | Should, then question | [TIL] |
| 12 | Retention: set limits for `journeys` rows (suggest 30 days after the end unless saved), `code_requests` (suggest 7 days) and sessions. Today they have none | Should | PRD |
| 13 | Account deletion must remove the user, their circle, journeys, links and Durable Object state. The foreign keys cascade in D1, but there is no delete-account route yet, and a running journey's Durable Object has to be wiped too | Must | PRD |
| 14 | Privacy policy and terms in Vietnamese and English, linked from onboarding and from the circle's page, listing the processors above and where the data is stored | Must | [FPF] |
| 15 | Penalties for reference: up to 5% of the previous year's revenue for cross-border violations (VND 3 billion when that comes to less), and up to VND 3 billion for most other violations | Info | [FPF], [TIL] |

## Draft notice to a new circle contact

For the lawyer to check, then for `packages/i18n` once the circle-contact flow ships. It goes to the contact's phone, never the traveller's, so it can name Cage.

> {{name}} vừa thêm số của bạn vào danh sách người thân trên Cage. Bạn chỉ nhận tin khi {{name}} cần giúp trên đường đi. Không muốn nhận tin, trả lời HUY.

> {{name}} added your number to their trusted contacts on Cage. You will only hear from us if {{name}} needs help on a trip. To stop these messages, reply STOP.

## What Jaden needs to do

1. Find a Vietnamese data protection lawyer (several firms in the sources publish on this law) and send them this file. Ask finding 1 first.
2. Decide whether to register the company now or after the hackathon. The filings in findings 3 to 5 need it.
3. Bring the lawyer's answers back here, update the PRD and, if storage moves, write ADR 0004.

## Sources

- [FPF] Future of Privacy Forum, "Making sense of Vietnam's latest data protection and governance regime", January 2026. https://fpf.org/wp-content/uploads/2026/01/January-2026-FPF-Issue-Brief-Making-Sense-of-Vietnams-Latest-Data-Protection-and-Governance-Regime-1.pdf
- [TIL] Tilleke & Gibbins, "Vietnam's new Personal Data Protection Law: a closer look", August 2025, updated for Decree 356. https://www.tilleke.com/insights/vietnams-new-personal-data-protection-law-a-closer-look/
- [VLM] Vietnam Law Magazine, "New legal framework on personal data protection in Vietnam", 15 February 2026. https://vietnamlawmagazine.vn/new-legal-framework-on-personal-data-protection-in-vietnam-78691.html
- [EY] EY Vietnam, "Luật An ninh mạng 2025 của Việt Nam: các điểm chính và yêu cầu tuân thủ", June 2026. https://www.ey.com/vi_vn/technical/tax/tax-and-law-updates/luat-an-ninh-mang-2025-cua-viet-nam-cac-diem-chinh-va-yeu-cau-tuan-thu
- [HTPL] Law 116/2025/QH15 text and summary. https://hethongphapluat.com/law-no-116-2025-qh15-dated-december-10-2025-on-cybersecurity.html (the localisation wording comes from the site's summary, not the verbatim article, so check the article number)
- [TIL-53] Tilleke & Gibbins, "Decree 53 provides long-awaited guidance", August 2022. https://www.tilleke.com/insights/decree-53-provides-long-awaited-guidance-on-implementation-of-vietnams-cybersecurity-law/
- [FF] Freshfields, "Data localisation in Vietnam: highlights under Decree 53 and Decree 13", December 2023. https://www.freshfields.com/en/our-thinking/blogs/technology-quotient/data-localisation-in-vietnam-highlights-under-decree-53-and-decree-13-102iulg
- [CF-D1] Cloudflare, D1 data location. https://developers.cloudflare.com/d1/configuration/data-location/
- [CF-DO] Cloudflare, Durable Objects data location. https://developers.cloudflare.com/durable-objects/reference/data-location/
- [BPL] Báo Pháp luật, Decree 162/2025 and the 111 launch. See [hotlines.md](hotlines.md).

Not yet checked: how a traveller withdraws consent, how fast Cage must answer an access or deletion request, the official child age, and the localisation article number. All four are for the lawyer.
