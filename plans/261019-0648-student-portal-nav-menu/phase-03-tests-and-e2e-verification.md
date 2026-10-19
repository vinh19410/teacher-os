---
title: "Phase 3: Unit tests, E2E verification & kiểm tra 3 viewport"
status: todo
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

- [ ] Thêm unit test `apps/student/test/student-nav.test.tsx` kiểm tra 5 mục điều hướng, `activeOptions` và cấu trúc `StudentShell`.
- [ ] Cập nhật `apps/e2e/specs/tuition-bank-transfer.spec.ts:265` giới hạn phạm vi tìm link hóa đơn vào `page.getByRole("main")` để không bấm nhầm link `"Học phí"` trên `<header>`.
- [ ] Bổ sung E2E test kiểm tra điều hướng giữa `Tổng quan` (`/`), `Lớp học` (`/classes`), `Bài tập` (`/assignments` kèm `?status=`), `Từ vựng` (`/vocab`), `Học phí` (`/tuition`).
- [ ] Chạy toàn bộ cổng kiểm tra: `pnpm check`, `pnpm check-types`, `pnpm --filter student test`, và E2E.

## Implementation Steps

1. **Thêm unit test `apps/student/test/student-nav.test.tsx`**:
   - Kiểm tra `StudentNav` render đúng 5 mục (`Tổng quan`, `Lớp học`, `Bài tập`, `Từ vựng`, `Học phí`) với `href` tương ứng (`/`, `/classes`, `/assignments`, `/vocab`, `/tuition`) và `aria-label="Điều hướng học viên"`.
   - Kiểm tra `StudentShell` kết xuất cả tên học viên, `StudentNav`, và phần nội dung `children`.
   - Kiểm tra `AssignmentList` với `hideHeading` và `activeTab` được truyền từ ngoài (phục vụ trang `/assignments`).

2. **Cập nhật `apps/e2e/specs/tuition-bank-transfer.spec.ts`**:
   - Tại dòng 264–267, đổi:
     ```ts
     await page
       .getByRole("main")
       .getByRole("link", { name: /Học phí/ })
       .first()
       .click();
     ```
     để chọn đúng dòng hóa đơn trong `<main>` thay vì link điều hướng `"Học phí"` trong `<header>`.

3. **Bổ sung E2E kiểm tra menu học viên**:
   - Trong `apps/e2e/specs/student-class-detail.spec.ts` (hoặc spec riêng), kiểm tra:
     - Thanh điều hướng `page.getByRole("navigation", { name: "Điều hướng học viên" })` hiển thị 5 link.
     - Bấm `Lớp học` → URL `/classes`, mục `Lớp học` có `aria-current="page"`.
     - Bấm `Bài tập` → URL `/assignments`, mục `Bài tập` có `aria-current="page"`, bấm tab `Sắp đến hạn` cập nhật URL `?status=due-soon`.
     - Bấm `Từ vựng` → URL `/vocab`, mục `Từ vựng` có `aria-current="page"`.
     - Bấm `Học phí` → URL `/tuition`, mục `Học phí` có `aria-current="page"`.
     - Bấm `Tổng quan` → quay về `/`, mục `Tổng quan` có `aria-current="page"`.

4. **Chạy cổng kiểm tra local & kiểm tra 3 viewport**:
   - `pnpm check`
   - `pnpm check-types`
   - `pnpm --filter student test`
   - `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e`

## Todo

- [ ] Tạo `apps/student/test/student-nav.test.tsx`
- [ ] Cập nhật `apps/e2e/specs/tuition-bank-transfer.spec.ts`
- [ ] Bổ sung E2E test cho menu điều hướng học viên
- [ ] Chạy pass `pnpm check`, `pnpm check-types`, `pnpm --filter student test` và E2E

## Success Criteria

- Unit tests mới và cũ trong `apps/student` đều pass (`pnpm --filter student test`).
- Suite E2E (`student-class-detail.spec.ts`, `tuition-bank-transfer.spec.ts`, `student-quiz-take-review.spec.ts`, `vocab-srs.spec.ts`) đều pass.
- Giao diện hiển thị chuẩn trên 3 viewport (`1440×900`, `768×1024`, `375×812`) và hỗ trợ điều hướng bàn phím (`Tab`, `Enter`, focus ring `--focus-ring`).
