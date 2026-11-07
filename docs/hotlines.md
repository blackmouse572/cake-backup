# Hotline and NGO partners (Vietnam)

Research notes for #32, written 2026-11-07. The numbers below come from the organisations' own pages or from official press, with the link next to each one. None is confirmed by the organisation yet; that is the outreach list at the end. Until it is done, no number here should go into `packages/shared` as "confirmed".

## Summary

- **Tổng đài 111 is the right default for the hotline step.** Since Decree 162/2025 it is also the national anti-trafficking line, not only the child protection line. It is free, recorded, open 24 hours every day, takes reports about adults as well as children, and passes each report to the police, border guard or commune authorities [BPL-1], [VOH].
- **The Blue Dragon number in the code is unverified and probably wrong.** `HOTLINES.blueDragon` in `packages/shared/src/escalation.ts` is `18001567`. That number is not on Blue Dragon's website. Their contact page gives an office line for Vietnam business hours and sends emergencies to the police or 111 [BD]. The circle's page should stop showing it until Blue Dragon confirms a number.
- **113 is the police emergency number.** It stays optional and off by default, as the PRD says.
- **For Vietnamese abroad, the consular citizen protection line is +84 981 84 84 84** [TT], [DTI]. It is the natural number for the post-MVP cross-border case.
- **Pacific Links has a help line for people trafficked or forced into online scams** [PL], which fits Cage's cross-border users. It is a good second NGO to approach.

## Options for the hotline step

| Who | Number | Hours | Who it helps | What happens after a call | Source |
| --- | --- | --- | --- | --- | --- |
| Tổng đài 111, national anti-trafficking and child protection line, run by the Ministry of Health | 111 | 24/7, free | Anyone, about adults or children | Recorded, counselling (legal, psychological, support), report passed to police, border guard or the commune within the workflow in Decree 162 Art. 6 | [BPL-1], [BPL-2], [VOH], [VNP] |
| Công an (police emergency) | 113 | 24/7 | Anyone | Police respond. Risky for migrants without papers, so opt-in only | PRD |
| Blue Dragon Children's Foundation, Hà Nội | +84 24 3717 2307 | Vietnam business hours, not 24/7 | Children and adults in trafficking or exploitation; rescue and outreach | Trafficking reports by email to info@bdcf.org | [BD] |
| Pacific Links Foundation | +84 988 488 000 | Not stated | People forced to work, trafficked or forced into online scams | Not stated | [PL] |
| Cục Lãnh sự, Bộ Ngoại giao (consular citizen protection) | +84 981 84 84 84 | Not stated | Vietnamese citizens abroad | Embassy or consulate help | [TT], [DTI] |
| Hagar International, Vietnam | No number published | Says it runs a 24/7 hotline | Survivors: crisis shelter, social services | Unknown | [HG] |
| CSAGA | 024 3333 55 99 | Not stated | Gender-based and domestic violence, LGBTQ counselling; not trafficking specific | Counselling | [CS] |

Not reached: Alliance Anti-Trafic (its site blocks automated reading) and IOM Vietnam (its site lists no service number). IOM co-ran the 111 launch, so it is a useful contact for introductions rather than a number to show.

## What an integration would need

Today the circle's page only shows numbers, and nobody is called automatically. That is the right first step. A direct alert, where Cage sends the case to a partner, needs more:

| Step | What it needs | Who |
| --- | --- | --- |
| Show a number on the circle's page | The organisation's yes to being listed, the number, hours and languages, and the wording they want | Jaden asks, then a code change |
| Give the caller something to say | A short case summary on the circle's page (who, last known place and time, battery, what triggered the alert) so the circle member can read it out to 111 | Design and copy, reviewed by an NGO |
| Send cases straight to an NGO | A written data sharing agreement (what is sent, how fast they answer, who sees it, how long they keep it), a named on-call contact, and a test run. Under the data protection law this is a new purpose, so the traveller must consent to it separately (see [privacy-review.md](privacy-review.md), finding 7) | Jaden, a lawyer, the NGO |
| Send cases to 111 | 111 takes phone calls; Decree 162 does not describe an API. Any direct channel would need an agreement with the Ministry of Health, so keep 111 as "the circle calls it" for the MVP | Later |

## Proposed data shape

For `packages/shared` once an organisation confirms, replacing the flat `HOTLINES` object so other countries can be added. Not in this change, because the numbers are not confirmed and the circle's page reads that file.

```ts
type Hotline = {
  id: string;            // "vn-111"
  country: "VN";         // ISO 3166-1 alpha-2
  name: { vi: string; en: string };
  number: string;        // dialable, e.g. "111" or "+842437172307"
  hours: "24/7" | { vi: string; en: string };
  languages: ("vi" | "en")[];
  step: "hotline" | "police" | "abroad";
  confirmedAt: string | null; // date the organisation confirmed it
};
```

## Outreach for Jaden

Each item needs a person, not code. Suggested order:

1. **Blue Dragon** (info@bdcf.org, +84 24 3717 2307): do they want to be listed on the circle's page, with which number and hours? Is 1800 1567 theirs? Would they review the alert and circle-page copy, and partner on direct alerts later?
2. **Pacific Links** (info@pacificlinks.org, form at pacificlinks.org/contact): same questions; ask about the hours of +84 988 488 000 and whether it suits cross-border cases.
3. **Tổng đài 111** (Ministry of Health; IOM Vietnam helped launch it): confirm they are happy for an app to point people to 111 for adult trafficking cases, and what a caller should have ready.
4. **Cục Lãnh sự**: confirm +84 981 84 84 84 is the current line before the cross-border feature uses it.
5. **Hagar International** (info@hagarinternational.org): ask for the Vietnam hotline number.

A short first message Jaden can adapt:

> Chào anh chị, em là Jaden, đang làm Cage, một ứng dụng giúp người đi đường xa (xe khách, taxi, xe người lạ) báo cho người thân khi gặp chuyện. Khi người thân không phản hồi, trang của Cage sẽ gợi ý gọi một đường dây hỗ trợ. Em muốn xin phép đưa số của tổ chức mình vào đó, và nhờ anh chị góp ý cách viết tin báo cho phù hợp với các trường hợp mua bán người. Anh chị cho em xin 20 phút để trình bày được không ạ?

## Sources

- [BPL-1] Báo Pháp luật, "Lễ khai trương Tổng đài điện thoại quốc gia về phòng, chống mua bán người 111", 19 September 2025. https://baophapluat.vn/le-khai-truong-tong-dai-dien-thoai-quoc-gia-ve-phong-chong-mua-ban-nguoi-111.html
- [BPL-2] Báo Pháp luật, "Tố giác, báo tin về hành vi mua bán người hãy gọi đến Tổng đài 111", 2 July 2025. https://baophapluat.vn/to-giac-bao-tin-ve-hanh-vi-mua-ban-nguoi-hay-goi-den-tong-dai-111.html
- [VOH] VOH, "Tổng đài 111 tiếp nhận tố giác mua bán người", 3 July 2025. https://voh.com.vn/xa-hoi/tong-dai-111-tiep-nhan-to-giac-mua-ban-nguoi-602957.html
- [VNP] VietnamPlus, Ministry of Health on anti-trafficking awareness, 17 July 2026. https://www.vietnamplus.vn/bo-y-te-tang-cuong-truyen-thong-phat-hien-phong-chong-mua-ban-nguoi-post1124712.amp
- [ND162] Decree 162/2025/ND-CP text. https://luatvietnam.vn/an-ninh-trat-tu/nghi-dinh-162-2025-nd-cp-huong-dan-luat-phong-chong-mua-ban-nguoi-404517-d1.html
- [BD] Blue Dragon, contact us. https://www.bluedragon.org/who-we-are/contact-us/
- [PL] Pacific Links Foundation, contact. https://pacificlinks.org/contact/
- [HG] Hagar International, Vietnam. https://hagarinternational.org/vietnam/
- [CS] CSAGA. https://csaga.org.vn/
- [TT] Thanh Tra, 9 April 2025 (lists the consular line and baohocongdan@gmail.com). https://thanhtra.com.vn/doi-ngoai-97D2D2A31/canh-giac-truoc-nhung-loi-moi-chao-ra-nuoc-ngoai-lam-viec-nhe-luong-cao-4b05a9b91.html
- [DTI] Dân trí International, 24 October 2023. https://dtinews.dantri.com.vn/print/20231023212738017.htm
