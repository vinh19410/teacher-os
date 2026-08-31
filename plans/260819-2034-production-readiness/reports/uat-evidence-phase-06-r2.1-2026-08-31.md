# UAT evidence phase-06 r2.1 — 2026-08-31 (đóng 2 GO-gap còn lại của r2)

Bổ sung cho [r2 (2026-08-30)](./uat-evidence-phase-06-r2-2026-08-30.md). Cùng
release commit, không deploy mới, không đổi topology. Verdict-only per sanitize
allowlist của phase-06: status, hostname redacted (`<domain>`), SHA, timestamp,
runner, pass/fail. Không hostname thật, không OAuth value/state, không cookie
value, không database ID/name, không PII, không secret.

## Thông tin run

- Release commit: `235275c` (giống r2; main; deploy CI run 33313994693)
- Runner: AI agent (Safari leg qua macOS accessibility/computer-use, theo chỉ
  đạo operator Vinh Tran). Operator cấp quyền Accessibility cho agent runner
  sáng 2026-08-31 — mở khóa GO-gap 1 của r2.
- Timestamp: 2026-08-31 (UTC; probes + browser leg ~04:00–04:45)
- App origin: `https://app.<domain>`; API origin: `https://api.<domain>` (redacted)
- Tài khoản UAT: tài khoản chuyên dụng dạng fixture (synthetic, tạo qua sign-up
  trên production ngay trước run — cùng phương thức r2 dùng cho Chrome leg)

## Post-deploy probes (re-run trước browser leg)

- `GET /readyz` → `200 {"ok":true}`, `cache-control: no-store` — pass
- `GET /` → `OK`, 200 — pass
- CORS preflight `Origin: https://app.<domain>` → 204,
  `access-control-allow-origin: https://app.<domain>` — pass

## Browser leg: Safari private (incognito-equivalent) — 6/6 PASS

Theo runner kit + phase-06 step 6; private window mới hoàn toàn.

- Step 1 sign-in: **pass** — sign-up/sign-in bằng email (fixture account);
  land `/dashboard` với `returnUrl` được consume; nav workspace render đủ.
- Step 2 cookie attributes: **pass** — verify bằng replay sign-in (curl) trên
  API origin: session cookie prefix `__Secure-`, `Domain=.<domain>`
  (dot-domain), `SameSite=None`, `Secure`, `HttpOnly` (giá trị không ghi).
  Phương pháp giống r2; đây là server Set-Cookie contract, không phụ thuộc
  browser engine.
- Step 3 bootstrap org: **pass** — org/actor tự bootstrap lúc sign-up.
- Step 4 syllabus/class/Add Student/roster: **pass** — syllabus
  `fixture-syl-safari-r21` (Writing, Band 7.0) tạo OK; class
  `fixture-cls-safari-r21` tạo OK (T3 19:00–20:30, 12 buổi, start 2026-09-01;
  dropdown template thấy syllabus tạo ở trang khác); Add Student
  `fixture-stu-safari-r21` OK; roster = **1 row** ("10/10", "Ổn"); counter
  student = 1; bảng classes = 1 row đúng lịch/sĩ số.
- Step 5 hard reload (Cmd+Shift+R): **pass** — class-detail + roster nguyên vẹn.
- Step 6 sign-out → sign-in lại: **pass** — Đăng xuất → `/login`; sign-in lại
  cùng account → `/dashboard`; vào Lớp học: class còn nguyên (sĩ số 1, T3
  19:00–20:30, 0/12 buổi, syllabus gắn đúng).

Ghi chú automation (không product blocker): gõ tên dài qua keyboard synthetic
bị IME chết ký tự một lần — xử lý bằng select-all + gõ lại; không liên quan
sản phẩm. Finding cosmetic đã biết xuất hiện lại như r2: header trang Lớp hiển
thị "3 lớp đang hoạt động" hardcode trong khi list thật = 1 (issue #106).

## GO-gap 2 của r2: Google OAuth leg — DEVIATION (operator-approved)

- Operator quyết định ngày 2026-08-31 (chỉ đạo trực tiếp cho agent, ghi tại
  đây): **chấp nhận deviation** — dùng email-auth incognito legs (Chrome r2 +
  Safari r2.1) làm bằng chứng auth cross-origin, thay vì chạy vòng Google
  sign-in thật với Google UAT account (không cấp).
- Cơ sở chấp nhận: (a) cookie contract đã verify đầy đủ attributes + behavior
  ở cả hai browser (dot-domain, `__Secure-`, SameSite=None/Secure/HttpOnly,
  session sống qua reload + sign-out/sign-in, server revoke thật 401 theo r2);
  (b) Google authorize precheck trên OAuth client production pass, không
  `redirect_uri_mismatch` (topology gate r2, sau khi operator chuyển sang
  client "Production" 2026-08-30); (c) CORS/negative-origin matrix pass.
- Việc chưa có bằng chứng: một vòng round-trip thật qua accounts.google.com
  trên production. Rủi ro thặng dư được retirement tự nhiên ở M4: giáo viên
  pilot thật đăng nhập bằng Google ngay trên production — pilot log sẽ ghi
  ngay nếu flow này lỗi (blocker ≤ 1 ngày làm việc theo DOD M4).

## Quyết định GO/NO-GO — GO

Unified GO table (r2 + r2.1):

| Hàng | Kết quả | Evidence |
|---|---|---|
| 1. Topology + cookie contract | pass | r2 step 2 + r2.1 cookie replay |
| 2. Chrome AND Safari incognito smokes | **pass** | Chrome: r2 step 7; Safari: r2.1 (6/6) |
| 3. Migration rehearsed, forward-only | pass | throwaway-D1 proof repaired `0006` (ledger 2026-08-20; phase-02 [x] + runbook ledger) |
| 4. `/readyz` + liveness + CORS | pass | r2 step 5 + r2.1 re-run |
| 5. First-snapshot blocking error + retry recover | pass | r2 step 8 (fault path) |
| 6. Negative-origin matrix | pass | r2 step 6 (row 4 kèm risk note đăng ký mở) |
| 7. Mutation outcomes truthful | pass | r2 step 7 + phase-05 spot-check |
| 8. Sanitize self-check | pass | allowlist áp cho r2 + r2.1 |
| 9. Recovery drill rehearsed | pass | phase-02 restore drill [x] + runbook RPO/RTO section |
| (Google OAuth leg) | **deviation approved** | xem mục GO-gap 2 ở trên |

**GO cho pilot (M4)** trên release `235275c`. Điều kiện ràng buộc duy nhất:
Google round-trip thật được verify ở lần onboard giáo viên pilot đầu tiên;
nếu lỗi → pilot blocker theo SLA M4, không phải NO-GO hồi tố.
