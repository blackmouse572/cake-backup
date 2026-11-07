# Glossary

Domain language for Cage. Use the English term in code and the Vietnamese term in product copy. The Vietnamese terms come from the design system (DS 03 on the [canvas](https://doop.design/c/2v_tmcapn2)); don't swap in synonyms.

| Term (code) | Vietnamese (UI) | Meaning |
| --- | --- | --- |
| Safety circle | Vòng an toàn | The trusted contacts a user picks to be alerted. In-app summaries say "vòng an toàn" and never list contact names. |
| Journey / trip | Chuyến đi | One planned trip: destination, travel mode (auto-detected), expected arrival. Location is shared only while a journey is active. |
| Check-in | Kiểm tra | Cage asking "are you safe?" when something looks wrong. |
| Check-in call | Cuộc gọi kiểm tra | An app-rendered, call-style check-in shown when the screen is locked. Not a real phone call. The user confirms with a code; one missed call triggers a retry after 1 to 2 minutes, then escalation. |
| Off route | Lệch tuyến | The user left the planned route, stopped too long, or missed the arrival time. Triggers a check-in. |
| Lost contact | Mất kết nối | The server stopped receiving updates. Alerts only the circle, and only after arrival time plus a buffer (about 20 minutes). Never call it "mất tích" (missing). |
| Alert | Báo ngay / Đã báo | Sending live location to the circle and then up the escalation ladder. "Báo ngay" is the action, "Đã báo" the sent state. |
| Escalation ladder | | Order of who is alerted: safety circle, then hotline/NGO, then police only if the user enabled it. |
| Safe code | Mã an toàn | The user's PIN to confirm they are safe. |
| Duress PIN | Mã khẩn cấp | A PIN that looks like "I'm safe" but silently sends the alert. |
| SOS | | Manual alert, always reachable during a journey. A one-second press and hold, so a pocket press can't raise it. |
| Fake call | | A fake incoming call that helps the user leave an uncomfortable situation. Distinct from the check-in call. |
| Disguise mode | Ngụy trang | Neutral app name and icon (for example a notes app), quiet notifications, quick-hide and a decoy screen. |
| Journal | Nhật ký | Timeline of a trip that can be saved and shared as evidence. Unsaved trips are deleted. |
| Pre-trip check | | Questions before a long or cross-border trip (who arranged it, who holds the passport, is the employer real) that flag scam signs. Post-MVP. |
| Live map | | Web page the circle opens from an SMS/Zalo link to follow a trip without installing the app. |
| Hotline | Tổng đài 111 | The default hotline step (Vietnam's national hotline 111). NGOs such as Blue Dragon sit at the same step. |
| Police | Công an 113 | Optional final step, off unless the user enables it. |
