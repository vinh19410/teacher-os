---
phase: 4
title: "E2E Updates, Visual Audit & Local Gates"
status: pending
priority: P1
effort: "2h"
dependencies: [1, 2, 3]
---

# Phase 4: E2E Updates, Visual Audit & Local Gates

## Goal

Cập nhật các spec E2E bị ảnh hưởng bởi thiết kế mới, bổ sung kiểm thử E2E cho luồng giao đề từ ngân hàng (#983), lịch sử giao (#979), nhân bản và xóa nháp, chạy toàn bộ gate local (`check`, `check-types`, unit tests, `design:compare`) và chụp ảnh kiểm tra 3 viewport + `320px` reflow ở cả Light & Dark.

## Files to Create / Modify

- Modify: `apps/e2e/specs/assignment-prompt-create.spec.ts`
- Modify: `apps/e2e/specs/class-assign.spec.ts`
- Modify: `apps/e2e/specs/assignment-bank.spec.ts`
- Create: `plans/reports/<ISSUE_NUM>-teacher-assignments-*.png` (POT screenshots)

## Tasks & Steps

### Task 4.1 — Cập nhật E2E specs và bổ sung kịch bản #979 / #983 / Nhân bản / Xóa nháp
- **Goal:** Đồng bộ selector theo thiết kế mới và kiểm chứng end-to-end 4 tính năng mới qua reload thật.
- **Target files and symbols:**
  - `apps/e2e/specs/assignment-prompt-create.spec.ts`
  - `apps/e2e/specs/class-assign.spec.ts`
  - `apps/e2e/specs/assignment-bank.spec.ts`
- **Steps:**
  1. Trong `assignment-prompt-create.spec.ts`: bấm nút `Tạo bài tập` mở menu rồi chọn menuitem `Bài lẻ` để đi `/assignments/new`.
  2. Trong `class-assign.spec.ts`: cập nhật `"Đã dùng 1 lớp"` / `"Đã dùng 2 lớp"` thành `"Đã giao 1 lớp"` / `"Đã giao 2 lớp"`.
  3. Trong `assignment-bank.spec.ts`:
     - Cập nhật chọn phần thi qua `<select aria-label="Phần thi">` (`writing:task1`), ô tìm `getByLabel("Tìm đề")`, dòng đếm `"Hiện"`.
     - Kiểm tra nút `"Xem trước"` trên bản nháp vẫn mở `/teacher/assignments/preview?id=...`.
     - Bổ sung kịch bản end-to-end: tạo lớp có 1 học viên → vào `/teacher/assignments` mở `"Giao cho lớp"` trên đề ready → chọn lớp & giao → xác nhận tab `"Lịch sử giao"` hiện tên lớp + `0/1` + reload vẫn giữ `"Đã giao 1 lớp"`; bấm `"Nhân bản"` → reload vẫn còn bản sao `"Bản nháp"`; bấm `"Xóa nháp"` → xác nhận → reload biến mất vĩnh viễn.
- **Success criteria:** 5 spec E2E liên quan chạy với port override 8100–8105 đều pass 100%.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e assignment-bank.spec.ts assignment-prompt-create.spec.ts class-assign.spec.ts assignment-prompt-reading-types.spec.ts assignment-prompt-map-listening.spec.ts` exits 0.

### Task 4.2 — Chạy toàn bộ Local Gates (`check`, `check-types`, unit tests)
- **Goal:** Bảo đảm toàn monorepo sạch lint/format, sạch TypeScript, và mọi test `@teacher-os/api`, `server`, `web` đều xanh.
- **Target files and symbols:** Toàn repo.
- **Steps:**
  1. Chạy `pnpm check:fix && pnpm check && pnpm check-types && pnpm --filter @teacher-os/api test && pnpm --filter server test && pnpm --filter web test`.
- **Success criteria:** Toàn bộ chuỗi lệnh thoát mã `0`.
- **Verify:** Chuỗi lệnh ở bước 1 exits 0.

### Task 4.3 — Chạy `design:compare`, kiểm tra `320px`/Light/Dark và chụp ảnh POT
- **Goal:** Xác minh trực quan tại `1440×900` (Light & Dark), `768×1024`, `375×812` và `320×568` (0 horizontal overflow, không hard-coded hex, contrast tốt), lưu ảnh POT vào `plans/reports/` và gửi báo cáo cho `kongming` Checkpoint #3.
- **Target files and symbols:** `plans/reports/<ISSUE_NUM>-teacher-assignments-*.png`.
- **Steps:**
  1. Chạy `node scripts/design-compare/capture.mjs --screens t-assignments --side both --force` (exit 0).
  2. Chạy script Playwright cục bộ (boot qua stack 8100–8105 với dữ liệu seed đa kỹ năng + lịch sử giao) để assert `scrollWidth <= innerWidth` ở `1440×900`, `768×1024`, `375×812`, `320×568` (Light + Dark) và xuất 4 ảnh POT:
     - `plans/reports/<ISSUE_NUM>-teacher-assignments-desktop-light.png`
     - `plans/reports/<ISSUE_NUM>-teacher-assignments-desktop-dark.png`
     - `plans/reports/<ISSUE_NUM>-teacher-assignments-tablet-light.png`
     - `plans/reports/<ISSUE_NUM>-teacher-assignments-mobile-light.png`
  3. Đọc kiểm trực tiếp tất cả ảnh PNG bằng `read_file`.
  4. Spawn `kongming` (**Checkpoint #3: post-implementation & verification**) gửi tóm tắt diff + kết quả toàn bộ gate + ảnh audit để xin xác nhận GO.
- **Success criteria:** `design:compare` exit 0, 0 overflow trên mọi viewport, ảnh sạch đẹp ở cả Light & Dark, `kongming` GO.
- **Verify:** `node scripts/design-compare/capture.mjs --screens t-assignments --side both --force` exits 0 và 4 file ảnh POT tồn tại, non-blank.

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
