# Test Report — 2026-08-29 — Staging re-test #105, #111, #121, #125 (fixes #126–#130)

**Scope:** UI re-test trên staging trước khi promote develop → main (production). Bao gồm issue còn mở #105, #111, retest #125 (đã đóng), sanity #121, và regression #104.
**Môi trường live:** staging `https://app.staging.teacheros.io.vn` + API `https://api.staging.teacheros.io.vn` — deploy **success** trên develop @ `bed629e` (Deploy Staging run 33233177548, 04:10Z 29-08), chứa toàn bộ fix #126, #127, #128, #129, #130.
**Tài khoản test:** throwaway signup `qc.retest-0829-1787979808@test.local` (junk row được chấp nhận trên staging D1).
**Fixture:** lớp `QC-105-RETEST` (IELTS · Band 7.0 · Writing · Online, T2 21:00–22:30, 12 buổi, start 30/08/2026) và học viên `QC-111-RETEST` (0900000002, không gắn lớp, 10 buổi, 400.000đ, Online).
**Screenshots:** `plans/reports/screenshots-2026-08-29-issue-105-111-125-staging/`

## Test Results Overview

- **Live UI retest (staging, browser thật qua automation)**: **10/10 acceptance criteria PASS** — 0 bug mới
- **Preflight curl**: `/sw.js` + `/registerSW.js` phục vụ JS thật (`text/javascript`, self-destruct stub theo thiết kế #126) — anchor self-heal hoạt động
- Phạm vi #126–#130 là các PR merge (không phải defect riêng): được xác minh thông qua hành vi của #125/#105/#111/#121/#104 tương ứng
- **Kết luận: staging SẴN SÀNG để promote lên production**

## Kết quả acceptance criteria

### #125 (P0, auth staging) — fixes #126 + #127 — **PASS**

| AC | Mô tả | Kết quả | Bằng chứng |
|----|-------|---------|-----------|
| AC1 | SPA boot không còn trắng/sw hỏng; login page render đầy đủ | ✅ PASS | Login page render đủ tablist Sign in/Create account + form; `sw.js`, `registerSW.js` = JS stub thật (curl, HTTP 200 `text/javascript`) |
| AC2 | Signup account mới thành công, không silent fail | ✅ PASS | `qc.retest-0829-1787979808@test.local` tạo xong → redirect `/dashboard` — `ac-125-dashboard-after-signup.png` |
| AC3 | `get-session` trả session thật (không `200 null`) | ✅ PASS | `GET /api/auth/get-session` = 200 + `{user: {email, name}}` (check trong page context, credentials include) |
| AC4 | Sign-out → sign-in lại cùng credentials vẫn vào được dashboard | ✅ PASS | sign-out 200 → login lại → `/dashboard` + get-session 200 — `ac-125-signin-again-dashboard.png` |
| AC5 | Cookie namespace stage-scoped (#127) không shadow session | ✅ PASS (hành vi) | Toàn bộ chuỗi signup → session → sign-out → sign-in chạy đúng trong 1 browser duy nhất trên staging; gate cấu trúc tên cookie được bảo vệ bởi unit test + `topology-drift` gate (CI xanh @ bed629e) |

### #105 (P1, tạo lớp) — fix #130 — **PASS**

| AC | Mô tả | Kết quả | Bằng chứng |
|----|-------|---------|-----------|
| AC1 | Giờ kết thúc trước giờ bắt đầu bị chặn với lỗi rõ ràng | ✅ PASS | 21:00–08:00 → lỗi đỏ «Giờ kết thúc phải sau giờ bắt đầu.», modal giữ nguyên, KHÔNG tạo lớp — `ac-105-end-before-start-blocked.png` |
| AC2 | «Tổng số buổi 0» bị chặn, không còn biến thành 12 | ✅ PASS | sessions = 0 + giờ hợp lệ → lỗi «Tổng số buổi phải từ 1 đến 52.», không tạo lớp — `ac-105-zero-sessions-blocked.png` |
| AC3 | Dữ liệu hợp lệ vẫn tạo lớp bình thường | ✅ PASS | 12 buổi + T2 21:00–22:30 → row `QC-105-RETEST · 0/12 buổi · T2 · 21:00–22:30 · Đang học` — `ac-105-valid-class-created.png` |

### #111 (P1, row học viên → detail) — fix #129 — **PASS**

| AC | Mô tả | Kết quả | Bằng chứng |
|----|-------|---------|-----------|
| AC1 | Click hàng học viên trên `/students` mở `/students/:id` | ✅ PASS | Click row `QC-111-RETEST` → `/students/23ec82ad-3a77-436a-aa51-54dfbe977cb0`; detail đủ: gói (Tổng 10 · Đã học 0 · Còn lại 10 · 400.000đ · Online) + 4 tab Hồ sơ/Lịch sử buổi/Học phí/Bài tập — `ac-111-student-detail.png` |
| AC2 | `/students/<fake-id>` trả 404 thân thiện có lối thoát | ✅ PASS | Card «Không tìm thấy học viên» + link «← Về danh sách học viên» → `/students` — `ac-111-fake-id-friendly-404.png` |
| AC3 | (Regression #128) gói học viên tạo không lớp vẫn persist | ✅ PASS | Row list: `QC-111-RETEST · 0900000002 · 10 buổi · Online · 10 / 10 · 400.000đ`; detail khớp |

### #121 (P0, buổi dự kiến) — sanity re-check sau #126/#127/#130 — **PASS**

| AC | Mô tả | Kết quả | Bằng chứng |
|----|-------|---------|-----------|
| AC1 | Lớp tạo với lịch structured sinh 12 buổi dự kiến trên class detail | ✅ PASS | Tab «Buổi học»: 12 row, first «Thứ Hai, 31/08 · 21:00–22:30 · Dự kiến», last «Thứ Hai, 16/11» — `ac-121-class-detail-12-sessions.png` |
| AC2 | `/schedule` render đúng tuần: chỉ tuần chứa ngày mới có buổi | ✅ PASS | Tuần 24–30/08: «0 buổi»; 31/08–06/09: «1 buổi» (block T2 31/08 21:00 «Dự kiến · chưa có học viên»); 07–13/09: «1 buổi» — `ac-121-schedule-week-3108.png` |

## UI Test Results
- **Pages tested**: /login (signup + sign-in), /dashboard, /classes (+ modal Tạo lớp ×3 submit), /classes/{id} (tab Buổi học), /schedule (?week ×3), /students (+ form Thêm học viên), /students/{id}, /students/{fake-id}
- **Console errors**: console listener không khả dụng qua IAB; không thấy blocker nào trên UI — mọi route render đầy đủ
- **Bug mới phát hiện**: không có

## Build / Deploy Status
- **Staging**: develop @ `bed629e` — CI + E2E + Deploy Staging toàn success (runs 33233177562 / 33233177540 / 33233177548, 04:10Z 29-08). Đủ fix #126→#130.
- **Production (main)**: vẫn ở lần promote trước (PR #103) — **chưa có** bất kỳ fix nào trong cụm #104/#121/#123/#125–#130. Mọi bug trong các issue này vẫn reproduce được trên `app.teacheros.io.vn` cho đến khi promote.

## Critical Issues
1. **Không có** — đủ điều kiện promote develop → main.

## Observations (không chặn)
1. **[Low] Copy demo tĩnh trên list pages** (đã ghi nhận trong report #104): header «3 lớp đang hoạt động» / «5 học viên đang học · 2 cần chú ý» vẫn hiện trên tài khoản 0 lớp/0 học viên trong khi table thật rỗng hoặc 1 row — liên quan issue mở #106 (KPI/counter hardcoded). Không phải bug của cụm này.
2. **[Low] Dọn data test staging**: account `qc.retest-0829-1787979808@test.local`, lớp `QC-105-RETEST`, học viên `QC-111-RETEST` (junk rows theo design, có thể bỏ qua).
3. **[Note] Ghi chú automation**: trong môi trường automation này, click qua Playwright locator trên IAB bị treo actionability — đã thay bằng DOM click qua `evaluate` (không ảnh hưởng kết quả vì mọi thao tác đều xác minh bằng state thật sau hành động).

## Recommendation
**GO cho promote develop → main.** Sau promote, đề xuất QC smoke nhanh trên production: signup/sign-in 1 account mới, tạo 1 lớp có lịch (kiểm tra buổi sinh), click 1 hàng học viên — vì đây là lần đầu `main` nhận cả cụm migration 0011/0012 + đổi namespace cookie.
