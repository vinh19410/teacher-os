# Test Report — 2026-08-28 — QC re-test #121 (projected sessions, beta)

**Scope:** UI re-test cho issue #121 «[QC][P0] Tạo lớp có lịch không sinh buổi trên /schedule» sau khi PR #123 merge vào develop (commit 141eb9c).
**Môi trường live:** staging `https://app.staging.teacheros.io.vn` (deploy-staging run 33168550938 — success, gồm cả #123 + #126 + #127).
**Tài khoản test:** throwaway signup `qc121-retest-b-1787923977@test.local` (junk row được chấp nhận trên staging D1).
**Fixture:** lớp `QC-121-RETEST` — IELTS · Writing · Online, T2 19:00–20:30, 12 buổi, start **31/08/2026** (thứ Hai đầu tiên của fixture gốc 28/08 — sửa lịch theo chú thích calendar trong issue: 01/09/2026 là thứ Ba).

## Test Results Overview
- **Local e2e (Playwright, full suite)**: 26 tests — **25 passed**, 1 skipped (spec Google OAuth, skip theo thiết kế khi không có OAuth config) — 33.7s
- **Unit tests (vitest, apps/web)**: **358/358 passed** (33 files, gồm `class-sessions.projection.test.ts`, `schedule-week.test.ts`)
- **Live UI beta (staging)**: 5/5 acceptance criteria PASS — 0 console blocker, 0 bug mới
- **Screenshots**: `plans/reports/screenshots-2026-08-28-issue-121/`

## Kết quả acceptance criteria (live trên staging)

| AC | Mô tả | Kết quả | Bằng chứng |
|----|-------|---------|-----------|
| AC1 | Lớp có lịch, 0 học viên → tab «Buổi học» liệt kê 12 buổi dự kiến, first = 31/08 | ✅ PASS | 12 `tbody tr`, badge «Dự kiến» ×12, first «Thứ Hai, 31/08», last «Thứ Hai, 16/11» — `ac1-sessions-table3.png` |
| AC2 | /schedule chỉ render buổi trong tuần chứa ngày | ✅ PASS | 24/08: 0 · 31/08: 1 · 07/09: 1 · 16/11: 1 · 23/11: 0 · 04/01/2027: 0 — `ac2-week-3108.png` |
| AC3 | Buổi dự kiến không có write target (không CTA, không modal) | ✅ PASS | Class detail: 0 nút «Điểm danh»/«Điều chỉnh». /schedule: block là `<div>` (a11y `generic`, không phải button); click thật → `role=dialog` không xuất hiện |
| AC4 | Enroll học viên đầu → projection flip sang row thật, cùng ngày, không duplicate | ✅ PASS | Vẫn đúng 12 row, 0 «Dự kiến», badge «Sắp tới» + nút «Điều chỉnh» mỗi row, dates 31/08→16/11 giữ nguyên. /schedule tuần 31/08 flip sang block thật (tên học viên «Nguyễn Văn Dự Kiến · 1:1»), là `<button>`, click mở LessonModal («Sửa buổi / Hủy buổi») — `ac4-flipped-real-rows.png`, `ac4-week-3108-after-enroll.png` |
| AC5 | Legacy/invalid schedule render như cũ (fail-closed) | ✅ PASS (unit) | Ma trận fail-closed trong `class-sessions.projection.test.ts` (free-text schedule, start===end, startDate invalid, total ngoài 1..52) — không test live vì modal chỉ nhận structured schedule |
| AC7 | Full test matrix xanh | ✅ PASS | e2e 25/25 + unit 358/358 (local, trên develop @ e08081c) |
| AC8 | Header /schedule phản ánh số buổi của tuần đang render | ✅ PASS | «Tuần 31/08–06/09 · 1 buổi», «Tuần 24–30/08 · 0 buổi», «Tuần 23–29/11 · 0 buổi» |

## UI Test Results
- **Pages tested**: /login, /classes, /classes/{id} (tab Buổi học), /schedule (?week= ×6)
- **Console errors**: không thu được lỗi blocking (SPA render đầy đủ mọi bước)
- **Responsive**: skipped (ngoài scope re-test)
- **Bug mới phát hiện**: không có

## Build / Deploy Status
- **Local e2e + unit**: PASS trên develop @ e08081c
- **CI**: E2E + Deploy Staging success trên develop (run 33168550938 / 33168551031, 11:48Z)
- **⚠️ Production CHƯA có fix**: fix 141eb9c chỉ nằm trên `develop` + staging; `main` (prod, app.teacheros.io.vn) lần cuối promote 2026-08-27 (PR #103) — **trước** khi fix #123 merge. URL fixture trong issue (`app.teacheros.io.vn/classes/e6b4431a-…`) sẽ vẫn trả về 0 buổi cho đến lần promote prod kế tiếp.

## Critical Issues
1. **Không có** — bug gốc #121 đã xác nhận hết trên beta theo cả 5 AC.

## Recommendations
1. **[High] Promote develop → main** để prod nhận fix #123 (kèm #125/#126/#127 — cụm fix auth staging cũng chưa lên prod); sau promote, QC re-test nhanh trên prod với fixture gốc `QC-CTA-CLASS` (kỳ vọng: 12 «Dự kiến», first 31/08/2026).
2. **[Medium] Follow-up issue dashboard** (đã ghi trong issue): «Lịch hôm nay» trên dashboard vẫn chỉ đọc row thật — quyết định có tính projected block không.
3. **[Low] Cosmetic**: block projected trên /schedule luôn dùng accent 1:1 (blue) bất kể loại lớp — đã ghi nhận trong advisory review.
4. **[Low] Dọn data test staging**: lớp `QC-121-RETEST` + tài khoản throwaway trên staging D1 (junk row được chấp nhận theo design; có thể bỏ qua).

## Unresolved Questions
- Không có câu hỏi chặn. Việc test AC4 trực tiếp trên fixture `QC-CTA-CLASS` của `usertest1@mail.com` không thực hiện được (không có password tài khoản QC); đã tái lập đúng repro bằng lớp mới `QC-121-RETEST` trên cùng môi trường beta.
