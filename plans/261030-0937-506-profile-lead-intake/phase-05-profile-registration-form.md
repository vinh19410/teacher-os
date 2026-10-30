---
phase: 5
title: "Form đăng ký mới trên profile"
status: completed
priority: P1
effort: "0.6d"
dependencies: [2]
---

# Phase 5: Form đăng ký trên apps/profile

## Goal
Thay form copy-Zalo (`#dang-ky-tu-van`, `consultForm`) bằng form gửi `POST /public/leads`, danh mục khóa theo Google Form, chỉ bắt buộc Tên + SĐT, có màn thành công và fallback.

## Files to Create / Modify
- Modify: `apps/profile/public/index.html` (markup form ~dòng 2716–2790, script mục 8 ~dòng 3097–3150, `applyQuizToFormBtn` ~dòng 3189, CSS form ~dòng 1244–1330)
- Modify: `apps/profile/serve.mjs`, `apps/profile/build.mjs` — thay `<meta name="lead-api">` khi có env `LEAD_API_URL`
- Modify: `apps/profile/tests/index.test.mjs`
- Create: `apps/server/src/lead-catalog-drift.test.ts` — đọc `apps/profile/public/index.html`, so `value` các option `course`/`studyMode`/`studyDays`/`timeSlot` với enum `lead-contracts.ts`

## Tasks & Steps
1. `<head>`: `<meta name="lead-api" content="https://api.teacheros.io.vn">`. `serve.mjs`: khi trả `index.html` và có `process.env.LEAD_API_URL` thì thay `content`; mặc định dev `http://localhost:8000`. `build.mjs`: sau khi copy, thay trong `dist/index.html` nếu có env.
2. Markup form (giữ `novalidate`, `label for`, `aria-describedby`, class sẵn có):
   - Tên* (`autocomplete="name"`), SĐT Zalo* (`type="tel" inputmode="tel" autocomplete="tel"`), Email (`type="email" autocomplete="email"`), Ngày sinh (`type="date"`).
   - Khóa học: một `<select name="course">` với `<optgroup label="IELTS">` 6 lớp, `<optgroup label="Giao tiếp định hướng IELTS">` 5 lớp, option `undecided` "Chưa rõ – cần test 1-1 cùng cô Mỹ", option rỗng "Chọn khóa (không bắt buộc)".
   - Ngày học: nhóm radio dạng chip (MT/TF/WS/SS/Linh hoạt), Khung giờ: nhóm radio chip (5 khung + Linh hoạt) — `fieldset` + `legend`.
   - Mục tiêu/ghi chú (`textarea` ≤ 500), Kết quả test: ô ẩn `placement` tự điền từ quiz + `<details>` "Đã làm test examenglish?" chứa 1 ô text và 2 link (Grammar, Listening) — không lặp câu hỏi.
   - Honeypot: `<div aria-hidden="true" style="position:absolute;left:-9999px">` với `input name="website" tabindex="-1" autocomplete="off"`.
   - Giữ "Hình thức & Quy mô lớp" làm `<select name="studyMode">` tùy chọn với value theo D12 (`group-online`, `private-online`, `offline-vgp`) + option rỗng. <!-- Updated: Validation Session 1 - giữ hình thức lớp -->
3. Script:
   - Lưu `formRenderedAt = Date.now()`; khi submit gửi `elapsedMs`.
   - Validate Tên (≥ 2 ký tự) + SĐT (chuẩn hóa như contract, `^0\d{9}$`) khi blur và submit; focus trường lỗi đầu tiên; email/ngày sinh chỉ validate khi có giá trị.
   - `fetch(leadApi + "/public/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body })` với timeout 10s (`AbortController`); nút submit `aria-busy` + disable trong lúc gửi.
   - 200/201 ⇒ ẩn form, hiện khối thành công (`role="status"`): tóm tắt đăng ký, câu "Cô Mỹ sẽ liên hệ qua Zalo để xếp lịch", nút "Nhắn Zalo cô Mỹ". Không hiện thông tin chuyển khoản/VietQR (D10). <!-- Updated: Validation Session 1 - bỏ thanh toán -->
   - 400 ⇒ map field lỗi về input; 403/413/429/5xx/timeout/mạng ⇒ giữ nguyên dữ liệu, hiện `generatedMsgBox` (tái dùng logic tạo text cũ) + nút copy + Zalo, kèm câu giải thích ngắn.
   - Lưu nháp vào `localStorage` (try/catch) khi nhập, xoá khi gửi thành công.
   - `applyQuizToFormBtn`: map `lastRecommendedCourse` sang `course` code mới (bảng map 3 lộ trình cũ → `ielts-advanced` / `ielts-foundation` / `comm-1` / `undecided`) và điền `placement`.
4. Cập nhật các nút CTA trên trang trỏ `#dang-ky-tu-van` (giữ anchor) và text "Đăng Ký Khóa Học" khớp form mới; xoá câu "Tạo Phiếu Đăng Ký & Copy Gửi Zalo".
5. Tests `index.test.mjs`: có `meta[name=lead-api]`; form có đúng 2 input `required`; có honeypot `website` với `tabindex="-1"`; mọi option khóa nằm trong `optgroup` hoặc là `undecided`/rỗng; vẫn không có `<script src>` ngoài; vẫn đúng 1 `<h1>`.
6. `lead-catalog-drift.test.ts` (server, vì profile không import TS): regex lấy `value` trong `select[name=course]`, `select[name=studyMode]` và radio `studyDays`/`timeSlot`, so tập với enum contract.

## Verification
- `pnpm --filter profile test`
- `pnpm --filter server test -- lead-catalog-drift`
- Thủ công: `LEAD_API_URL=http://localhost:8000 pnpm dev:profile` + API local, gửi form ở 375×812 và 1440×900; tắt API ⇒ thấy fallback.
