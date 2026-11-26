---
phase: 5
title: "Phase 5: Kiểm thử, E2E & Thẩm định hình ảnh"
status: completed
priority: P1
effort: "1.5h"
dependencies: [2, 3, 4]
---

# Phase 5: Kiểm thử, E2E & Thẩm định hình ảnh

## Goal
Chạy đầy đủ bộ gate chất lượng local (`biome`, `check-types`, unit tests `apps/student`), xác minh 8 spec E2E mục tiêu không regression (dùng port override `8100..8105`), bổ sung kiểm tra bấm `"Xem trước"` PDF on-demand trên Tab 3 trong E2E, kiểm tra 4 viewport Light/Dark (`1440×900`, `768×1024`, `375×812`, `320px` reflow) + keyboard focus, chạy `pnpm design:compare --screens s-class-detail --force`, cập nhật `DESIGN.md`, và chụp ảnh POT vào `plans/reports/`.

## Files to Create / Modify
- Modify: `apps/e2e/specs/class-shared-materials.spec.ts` (<!-- Updated: Red-Team RT-3 --> bổ sung bước bấm nút `"Xem trước <PDF_NAME>"` trên Tab 3 xác minh dialog mở & Escape đóng để phủ luồng on-demand preview mới)
- Modify: `DESIGN.md` (cập nhật mục `/classes/$classId` ghi nhận redesign 3 tab và các lệch có chủ đích vì không bịa dữ liệu server)
- Create (POT screenshots): `plans/reports/<issue>-student-class-*.png` (3 viewport + Dark cho 3 tab)

## TDD Structure

### Tests Before
Rà soát các test đã viết ở Phase 1–4; nếu phát hiện khe hở edge-case nào trong E2E hoặc visual audit thì bổ sung regression test tương ứng trước khi sửa.

### Refactor
Chỉnh sửa nhỏ về responsive/contrast/focus (nếu phát hiện khi thẩm định 4 viewport Light/Dark) và cập nhật `DESIGN.md`.

### Tests After
Chạy lại gate tổng hợp sau lần chỉnh sửa cuối cùng.

### Regression Gate
- `pnpm exec biome check .`
- `pnpm check-types`
- `pnpm --filter student test`
- 8 spec E2E mục tiêu với `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105`
- `pnpm design:compare --screens s-class-detail --force`

## Tasks & Steps

### Task 5.1 — Chạy bộ gate chất lượng local (`biome`, `check-types`, `student test`)
- **Goal:** Bảo đảm 0 lỗi lint/format, 0 lỗi TypeScript toàn monorepo, và 100% unit tests `apps/student` xanh.
- **Target files and symbols:** Toàn bộ file chạm trong `apps/student/`.
- **Steps:**
  1. Chạy `pnpm exec biome check .` (nếu lỗi format dùng `pnpm check:fix` rồi kiểm lại bằng `pnpm exec biome check .`).
  2. Chạy `pnpm check-types`.
  3. Chạy `pnpm --filter student test`.
  4. Kiểm tra không có mã màu hex cứng mới trong các file đã tạo/sửa ở `apps/student/src/components/class/`.
- **Success criteria:** Toàn bộ 3 lệnh exit 0 và grep hex cứng trả 0 kết quả mới.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm --filter student test` exits 0.

### Task 5.2 — Chạy 8 spec E2E mục tiêu & chụp ảnh POT 4 viewport Light/Dark
- **Goal:** Xác minh 0 regression trên tất cả hành vi thực tế của trang `/classes/$classId` (gồm cả `student-practice.spec.ts` và on-demand preview trên Tab 3) và thu thập bằng chứng hình ảnh 3 viewport (`1440×900`, `768×1024`, `375×812`) cả Light & Dark + kiểm tra `320px` không tràn ngang + kiểm tra Tab focus.
- **Target files and symbols:**
  - `apps/e2e/specs/student-class-detail.spec.ts`
  - `apps/e2e/specs/student-session-detail.spec.ts`
  - `apps/e2e/specs/student-classmates.spec.ts`
  - `apps/e2e/specs/student-practice.spec.ts` (<!-- Updated: Red-Team RT-1 -->)
  - `apps/e2e/specs/zoom-meeting.spec.ts`
  - `apps/e2e/specs/class-status.spec.ts`
  - `apps/e2e/specs/class-shared-materials.spec.ts` (<!-- Updated: Red-Team RT-3 -->)
  - `apps/e2e/specs/material-upload-student.spec.ts`
- **Steps:**
  1. Bổ sung kiểm tra bấm nút `"Xem trước ${PDF_NAME}"` → dialog mở → bấm `Escape` đóng trong `apps/e2e/specs/class-shared-materials.spec.ts` (bước 5 học viên).
  2. Kiểm tra cổng `8100..8105` trống (`ss -ltnp`), không chạy full suite E2E (theo `AGENTS.md`).
  3. Chạy 8 spec E2E mục tiêu với port override `8100..8105`.
  4. Chụp screenshot POT cho cả 3 tab (`Hành trình học`, `Bài tập`, `Tài liệu chung`) ở `1440×900` (Light & Dark), `768×1024` (Light), `375×812` (Light) và xác minh `scrollWidth <= clientWidth` ở `320px`, lưu vào `plans/reports/<issue>-student-class-*.png`, mở bằng `read_file` để tự soi trực quan (không cắt chữ, không chồng chéo, focus ring rõ).
- **Success criteria:** 8/8 spec E2E pass, 0 overflow trên 4 viewport, ảnh POT rõ ràng ở cả Light và Dark.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/student-class-detail.spec.ts specs/student-session-detail.spec.ts specs/student-classmates.spec.ts specs/student-practice.spec.ts specs/zoom-meeting.spec.ts specs/class-status.spec.ts specs/class-shared-materials.spec.ts specs/material-upload-student.spec.ts` exits 0.

### Task 5.3 — Chạy `pnpm design:compare --screens s-class-detail --force` và cập nhật `DESIGN.md`
- **Goal:** Bảo đảm công cụ đối chiếu thiết kế chụp mới sạch (`--force`, tránh pass giả trên ảnh cache cũ, <!-- Updated: Red-Team RT-14 -->) và `DESIGN.md` phản ánh đúng kiến trúc mới của 3 tab trên `/classes/$classId` cùng danh sách lệch có chủ đích.
- **Target files and symbols:** `DESIGN.md` (mục `Chi tiết lớp học viên (/classes/$classId)`).
- **Steps:**
  1. Chạy `pnpm design:compare --screens s-class-detail --force` và xác nhận exit 0.
  2. Đọc `DESIGN.md` dòng 110–125, cập nhật ngắn gọn mô tả 3 tab mới (`Hành trình học`, `Bài tập`, `Tài liệu chung`) và các lệch có chủ đích so với `open-design/student-classes.html` (không dựng dữ liệu server chưa trả: `BRIEF`, `Ghim`, `Mới`, `Đăng dd/mm`, modal nộp bài giả; giữ `TodoBanner` shell phía trên và 30 phút mở Zoom).
  3. Chạy lại `pnpm exec biome check .` sau khi sửa docs/file.
- **Success criteria:** `pnpm design:compare --screens s-class-detail --force` exit 0, `DESIGN.md` chính xác với source code.
- **Verify:** `pnpm design:compare --screens s-class-detail --force && pnpm exec biome check .` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same failure evidence to the user. Never continue by self-reasoning.
