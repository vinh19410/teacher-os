---
title: "Phase 3: E2E & verification gate"
status: completed
---

# Phase 3: E2E & verification gate

## Overview

- **Priority**: P1
- **Status**: completed
- Phụ thuộc Phase 1 + 2. Cập nhật e2e đang pin UI cũ, rồi chạy toàn bộ gate trước khi cook kết thúc.

**Key insights**:

- `apps/e2e/specs/student-package-validation.spec.ts` test "D4" (dòng 106–160) đang assert 3 label **hiển thị** ở enroll mode (dòng 143–146) và chặn enroll 0 buổi (dòng 151–159) — cả hai đều vô nghĩa sau thay đổi; phần create-mode (dòng 52–54 assert 3 input **ẩn**) giữ nguyên.
- `apps/e2e/specs/enroll-existing-student.spec.ts` chỉ chọn option → Lưu (không đụng input gói) — dự kiến **không đổi**, chỉ chạy lại xác nhận.

## Requirements

- [x] E2E khóa hành vi mới: enroll mode không còn 3 input gói; enroll vẫn thành công.
- [x] Toàn bộ gate xanh: unit (server, web), e2e 2 spec liên quan, typecheck, biome.

## Implementation Steps

1. `apps/e2e/specs/student-package-validation.spec.ts` — viết lại test "D4" (dòng 106–160):
   - Đổi tên test (vd. "class detail → enroll học viên có sẵn KHÔNG còn 3 input gói, chọn học viên là enroll được").
   - Thay assert visible (dòng 143–146) bằng `not.toBeVisible()` / `toHaveCount(0)` cho "Số buổi gói", "Đơn giá (VND)", "Hình thức".
   - Xoá đoạn fill "0" + `countPosts` chặn POST + assert field error (dòng 151–159) — validation client không còn tồn tại.
   - Giữ phần chọn option → Lưu → dialog ẩn → học viên xuất hiện trong roster; cập nhật comment D4 cho khớp hành vi mới.
2. Chạy lại `apps/e2e/specs/enroll-existing-student.spec.ts` — kỳ vọng xanh không cần sửa; nếu đỏ do UI đổi, cập nhật selector tối thiểu.
3. Gate tổng (chạy đủ, không bỏ bước):
   ```bash
   pnpm --filter server test
   pnpm --filter web test
   pnpm check-types
   pnpm check
   cd apps/e2e && pnpm exec playwright test student-package-validation enroll-existing-student
   ```

## Todo

- [x] Viết lại test D4 trong `student-package-validation.spec.ts`
- [x] Chạy lại `enroll-existing-student.spec.ts`
- [x] Full gate xanh (unit + e2e + typecheck + biome)

## Success Criteria

- Mọi lệnh gate trên exit 0.
- UI thực tế: mở lớp → "+ Thêm học viên" → tab "Học viên có sẵn" chỉ còn search + danh sách + Lưu; enroll xong gói học viên theo lớp.

## Risk

- E2E chạy cần server/web boot qua playwright config hiện có — không đổi config.
- Nếu `enroll-existing-student.spec.ts` đỏ vì lý do không liên quan (flaky mạng/data), chạy lại riêng spec đó để xác nhận trước khi kết luận.
