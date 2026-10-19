---
title: "Phase 3: Unit tests, E2E verification & kiểm tra 3 viewport"
status: completed
---

# Phase 3: Unit tests, E2E verification & kiểm tra 3 viewport

## Context Links

- [`apps/student/test/overview.test.tsx`](../../apps/student/test/overview.test.tsx)
- [`apps/e2e/specs/tuition-bank-transfer.spec.ts`](../../apps/e2e/specs/tuition-bank-transfer.spec.ts)
- [`apps/e2e/specs/student-class-detail.spec.ts`](../../apps/e2e/specs/student-class-detail.spec.ts)
- [`AGENTS.md`](../../AGENTS.md) — Gate verification & 3 viewports (`1440×900`, `768×1024`, `375×812`)

## Overview

Viết unit test cho `StudentNav` / `StudentShell` và các chế độ hiển thị của `AssignmentList`, cập nhật locator E2E tránh xung đột với link `"Học phí"` trên header, bổ sung kịch bản E2E điều hướng qua 5 trang của học viên và chạy toàn bộ cổng kiểm tra local.

## Requirements

- [x] Thêm unit test `apps/student/test/student-nav.test.tsx` kiểm tra 5 mục điều hướng, `activeOptions` và cấu trúc `StudentShell`.
- [x] Cập nhật `apps/e2e/specs/tuition-bank-transfer.spec.ts:265` giới hạn phạm vi tìm link hóa đơn vào `page.getByRole("main")` để không bấm nhầm link `"Học phí"` trên `<header>`.
- [x] Bổ sung E2E test kiểm tra điều hướng giữa `Tổng quan` (`/`), `Lớp học` (`/classes`), `Bài tập` (`/assignments` kèm `?status=`), `Từ vựng` (`/vocab`), `Học phí` (`/tuition`).
- [x] Chạy toàn bộ cổng kiểm tra: `pnpm check`, `pnpm check-types`, `pnpm --filter student test`, và E2E.

## Tasks & Steps (Handover Contract `--advice`)

### Task 3.1 — Thêm unit test `apps/student/test/student-nav.test.tsx`
- **Goal:** Kiểm tra `StudentNav`, `StudentShell` và chế độ controlled/ẩn tiêu đề của `AssignmentList` bằng unit test.
- **Target files and symbols:** `apps/student/test/student-nav.test.tsx`.
- **Steps:**
  1. Tạo `apps/student/test/student-nav.test.tsx` dùng `renderToStaticMarkup` và mock `@tanstack/react-router`, `@/lib/repos/student`, `@/lib/auth-client`.
  2. Kiểm tra `StudentNav` render `<nav aria-label="Điều hướng học viên">` với đủ 5 link (`/`, `/classes`, `/assignments`, `/vocab`, `/tuition`), `exact: true` cho `/` và `exact: false` cho 4 mục còn lại, kèm dấu `■` `aria-hidden="true"`.
  3. Kiểm tra `StudentShell` kết xuất tên học viên, `StudentNav`, và `children`.
  4. Kiểm tra `AssignmentList` khi truyền `hideHeading` và `activeTab="overdue"` + `aria-hidden="true"` trên badge số đếm.
- **Success criteria:** Tất cả unit test trong `apps/student` pass.
- **Verify:** `pnpm --filter student test` exits 0.

### Task 3.2 — Cập nhật E2E `tuition-bank-transfer.spec.ts` và bổ sung kịch bản điều hướng 5 trang học viên
- **Goal:** Tránh xung đột locator `"Học phí"` trên `<header>` trong `tuition-bank-transfer.spec.ts` và kiểm tra luồng điều hướng qua 5 mục menu học viên bằng Playwright E2E.
- **Target files and symbols:** `apps/e2e/specs/tuition-bank-transfer.spec.ts`, `apps/e2e/specs/student-class-detail.spec.ts`.
- **Steps:**
  1. Trong `apps/e2e/specs/tuition-bank-transfer.spec.ts:264-267`, đổi `page.getByRole("link", { name: /Học phí/ }).first().click()` thành `page.getByRole("main").getByRole("link", { name: /Học phí/ }).first().click()`.
  2. Trong `apps/e2e/specs/student-class-detail.spec.ts`, bổ sung test kiểm tra thanh `<nav aria-label="Điều hướng học viên">` điều hướng qua `/classes`, `/assignments` (kèm filter `?status=due-soon`), `/vocab`, `/tuition`, và quay về `/` với trạng thái `aria-current="page"` chính xác.
- **Success criteria:** Hai file E2E spec chạy pass trên cổng E2E (`8100/8101/8103`).
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e exec playwright test specs/student-class-detail.spec.ts specs/tuition-bank-transfer.spec.ts` exits 0.

### Task 3.3 — Kiểm tra 3 viewport (`1440×900`, `768×1024`, `375×812`) + keyboard focus và chạy toàn bộ cổng local
- **Goal:** Đảm bảo không có lỗi lint/type/unit/E2E và xác nhận hiển thị + keyboard focus trên 3 viewport chuẩn `AGENTS.md` / `REVIEW.md`.
- **Target files and symbols:** Toàn bộ các file đã chạm trong `apps/student` và `apps/e2e`.
- **Steps:**
  1. Chạy `pnpm check` và `pnpm check-types`.
  2. Chạy `pnpm --filter student test`.
  3. Kiểm tra giao diện trên 3 viewport (`1440×900`, `768×1024`, `375×812`) và keyboard focus (`Tab` qua 5 mục menu), chụp screenshot minh chứng.
- **Success criteria:** `pnpm check`, `pnpm check-types`, `pnpm --filter student test`, và E2E đều exit 0; không tràn ngang (`scrollWidth <= clientWidth`) ở cả 3 viewport.
- **Verify:** `pnpm check && pnpm check-types && pnpm --filter student test` exits 0.
## Todo

- [x] Tạo `apps/student/test/student-nav.test.tsx`
- [x] Cập nhật `apps/e2e/specs/tuition-bank-transfer.spec.ts`
- [x] Bổ sung E2E test cho menu điều hướng học viên
- [x] Chạy pass `pnpm check`, `pnpm check-types`, `pnpm --filter student test` và E2E

## Success Criteria

- Unit tests mới và cũ trong `apps/student` đều pass (`pnpm --filter student test`).
- Suite E2E (`student-class-detail.spec.ts`, `tuition-bank-transfer.spec.ts`, `student-quiz-take-review.spec.ts`, `vocab-srs.spec.ts`) đều pass.
- Giao diện hiển thị chuẩn trên 3 viewport (`1440×900`, `768×1024`, `375×812`) và hỗ trợ điều hướng bàn phím (`Tab`, `Enter`, focus ring `--focus-ring`).

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
