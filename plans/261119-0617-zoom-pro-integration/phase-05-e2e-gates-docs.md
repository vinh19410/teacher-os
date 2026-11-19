---
phase: 5
title: "E2E, gates, docs, ship-ready"
status: pending
priority: P1
effort: "4h"
dependencies: [4]
---

# Phase 5: E2E, gates, docs, ship-ready

## Goal

Spec E2E Zoom chạy xanh trên fake Zoom, toàn bộ gate local xanh, docs ghi cách cấu hình Zoom và các giới hạn đã biết, và có ảnh 3 viewport làm POT.

## Context

- Theo `AGENTS.md`: **không chạy full E2E ở local**; chỉ chạy spec lẻ với port override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105`. Kiểm `node -v` là v24 trước khi chạy.
- E2E boot đã chuyển sang fake Zoom ở phase 3 (Task 3.7): `/__e2e/zoom-recording`, `/__e2e/run-recording-cron`.
- Docs nêu biến môi trường: `README.md`, `docs/production-release-runbook.md` (đều có `GOOGLE_CLIENT_SECRET`).
- `packages/api/src/lead-contracts.ts` vẫn có chữ "Google Meet" (copy form landing) — **giữ nguyên** theo quyết định người dùng; các lệnh grep dưới đây loại trừ file này.

## Files to Create / Modify

- Move + rewrite: `apps/e2e/specs/google-meet.spec.ts` → `apps/e2e/specs/zoom-meeting.spec.ts`
- Modify: `README.md`, `docs/production-release-runbook.md`
- Create: ảnh POT `plans/reports/zoom-<view>-<viewport>.png`

## Tasks

### Task 5.1 — Spec E2E Zoom
- Target files: `apps/e2e/specs/zoom-meeting.spec.ts` (sau `git mv apps/e2e/specs/google-meet.spec.ts apps/e2e/specs/zoom-meeting.spec.ts`).
- Steps: giữ khung đăng ký bằng `signUpViaApi` và cách dựng lớp/học viên của spec cũ; đổi `test.describe` thành "Zoom meeting & recording per session"; kịch bản:
  1. Giáo viên mở lớp → bấm tạo Zoom cho một buổi → thấy link bắt đầu `https://zoom.us/j/`.
  2. Gọi `/__e2e/zoom-recording` với `{ ready: true }` rồi `/__e2e/run-recording-cron` → panel hiện "Xem recording" và "Mật khẩu recording: rec123".
  3. Học viên đăng nhập cổng học viên → thấy "Vào lớp (Zoom)", "Xem recording" và "Mật khẩu: rec123".
- Verify: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e zoom-meeting.spec.ts` exit 0 và output chứa `passed`.

### Task 5.2 — Gate toàn repo
- Steps: chạy lần lượt, không bỏ qua lỗi:
  1. `pnpm exec biome check .` (đỏ vì format → `pnpm check:fix` rồi chạy lại)
  2. `pnpm check-types`
  3. `pnpm test`
- Verify: cả ba lệnh exit 0; `grep -rliE "google ?meet|google-meet|googleMeet|meetUrl" apps packages --include=*.ts --include=*.tsx | grep -v node_modules | grep -v "packages/api/src/lead-contracts.ts" | wc -l` in `0`.

### Task 5.3 — Docs
- Target files: `README.md`, `docs/production-release-runbook.md`.
- Steps: ở chỗ liệt kê secret (cạnh `GOOGLE_CLIENT_SECRET`), thêm mục "Zoom (Server-to-Server OAuth)" gồm:
  - 4 biến `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` (GitHub secrets) và `ZOOM_HOST_USER` (GitHub variable, mặc định `me` = chủ tài khoản); thiếu 3 biến đầu thì tính năng Zoom tắt êm.
  - Scopes cần bật trên app S2S: tạo/sửa/xoá/đọc meeting và đọc danh sách cloud recording (danh sách ở `plans/261119-0617-zoom-pro-integration/plan.md` mục Dependencies).
  - Setting tài khoản Zoom: bật cloud recording; **tắt** "chỉ người đã đăng nhập mới xem được cloud recording" để học viên mở được share link + mật khẩu.
  - Meeting tạo với học viên vào trước giáo viên (không phòng chờ) và tự ghi hình cloud.
  - Cron `*/10` lấy recording; sau 72 giờ không có thì báo lỗi.
  - Giới hạn đã biết: 100 lệnh tạo/sửa meeting mỗi ngày cho host; cloud recording của gói Pro có dung lượng giới hạn, đầy thì recording báo lỗi và cần dọn trên Zoom; nếu phòng bị đóng rồi mở lại giữa buổi, chỉ recording của phiên cuối được lấy.
  - Xoá câu nào nói Google OAuth cần scope Calendar/Meet/Drive.
- Verify: `grep -c "ZOOM_CLIENT_SECRET" README.md` in số ≥ 1; `grep -c "ZOOM_CLIENT_SECRET" docs/production-release-runbook.md` in số ≥ 1.

### Task 5.4 — Ảnh POT 3 viewport
- Steps: chạy stack E2E như Task 5.1 (hoặc screenshot trong spec), chụp ở 1440×900, 768×1024, 375×812 cho: (a) panel Zoom của buổi có recording + mật khẩu (giáo viên), (b) trang lớp của học viên có "Vào lớp (Zoom)"; thêm 1 ảnh dark mode trang học viên. Lưu `plans/reports/zoom-<teacher|student>-<desktop|tablet|mobile|dark>.png`.
- Verify: `ls plans/reports/zoom-*.png | wc -l` in số ≥ 7.

### Task 5.5 — Dọn process
- Steps: dừng mọi dev server/vite/api đã khởi động cho E2E (theo PID đã ghi).
- Verify: `ss -ltnp | grep -E ":81(00|01|03|04|05) "` không in dòng nào.

## Ship notes (không thuộc executor)

- Trước deploy: tạo app Server-to-Server OAuth trên Zoom Marketplace bằng tài khoản Pro, bật scopes, thêm 3 secret + 1 variable vào GitHub; chỉnh setting recording như Task 5.3.
- Migration: production **chưa có** bảng `class_session_meeting` (0078 chưa lên `main`), deploy prod chạy tuần tự 0078 → 0081, không cần backup riêng. Staging đã có 0078: 0080 dựng lại bảng; link Meet thử nghiệm đã mirror vào `class_session.zoom` trên staging thành link chết — chấp nhận được. Vẫn export backup D1 staging trước khi deploy theo quy ước repo.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
