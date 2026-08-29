---
title: "Phase 1: e2e regression student row → detail + fake-id 404"
status: todo
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: e2e regression student row → detail + fake-id 404

## Overview

Thêm e2e regression test bảo vệ hành vi QC bắt được ở issue #111: hàng học
viên trên `/students` mở được trang chi tiết, và id lạ render not-found thân
thiện. Không đổi code production — test-only change.

## Requirements

- Functional: click hàng học viên (cả click chuột) điều hướng tới
  `/students/:id`; detail hiển thị tên học viên; id lạ hiển thị card
  "Không tìm thấy học viên" kèm link về `/students`.
- Non-functional: spec tuân convention hiện có (`apps/e2e/specs/`), dùng
  `signUpViaUi`, timezone Asia/Ho_Chi_Minh, không service worker.

## Related Code Files

- Create: `apps/e2e/specs/student-row-detail.spec.ts`
- Reference (read-only): `apps/web/src/routes/_auth/students/index.tsx`,
  `apps/web/src/routes/_auth/students/$studentId.tsx`,
  `apps/e2e/specs/helpers.ts`

## Implementation Steps

1. Tạo spec `student-row-detail.spec.ts` với 2 test:
   - **Test 1 (row → detail):** `signUpViaUi` → goto `/students` → mở modal
     "+ Thêm học viên" → fill "Họ tên học viên *" = tên duy nhất → Lưu →
     chờ tên visible → click text tên học viên (`.first()`) →
     `expect(page).toHaveURL(/\/students\/[^/]+$/)` → assert tên học viên
     visible lần nữa trong header detail (heading lớn trên detail) → assert
     các tab "Hồ sơ / Lịch sử buổi / Học phí / Bài tập" visible.
   - **Test 2 (fake-id 404):** sau sign-up, `page.goto("/students/e2e-fake-id")`
     → assert text "Không tìm thấy học viên" visible → assert link
     "← Về danh sách học viên" visible → click link → URL về `/students`.
2. Chạy `pnpm --filter e2e exec playwright test specs/student-row-detail.spec.ts`
   — cả 2 test phải pass (hành vi develop đã đúng; test thất bại nghĩa là
   spec sai, không phải code — điều tra trước khi sửa).
3. Chạy full `pnpm test` (turbo unit + e2e) để bảo đảm không regression.

## TDD notes

- Test-first đóng vai regression-guard: mô phỏng đúng flow QC (tạo học viên
  rồi click hàng). Vì develop đã đúng, "red" bước đầu không kỳ vọng — nếu
  red phải root-cause spec hoặc phát hiện regression thật trên develop
  (khi đó dừng, cập nhật issue #111).

## Success Criteria

- [x] 2 test mới pass local.
- [x] Full test suite xanh.
- [x] Không thay đổi file production code.
