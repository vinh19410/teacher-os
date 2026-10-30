---
phase: 4
title: "Phase 4: E2E, kiểm tra 3 viewport & cổng chất lượng toàn diện"
status: completed
priority: P1
effort: "1.5h"
dependencies: [1, 2, 3]
---

# Phase 4: E2E, kiểm tra 3 viewport & cổng chất lượng toàn diện

## Goal

Chứng minh bằng kịch bản E2E Playwright đầu-cuối rằng một giáo viên mới đăng ký (org rỗng, không cần bất kỳ tài khoản Student Portal nào) có thể tạo lớp, thêm học viên thủ công kích hoạt ngay, lập hóa đơn, giao bài tập, tạo và chấm bài nộp mẫu trên `/grading`, đồng thời vượt qua toàn bộ cổng chất lượng của repo.

## Files to Create / Modify

- Create: `apps/e2e/specs/manual-student-and-trial-grading.spec.ts` — kịch bản E2E trọn luồng cho giáo viên mới + kiểm tra hiển thị ở 3 viewport (`1440×900`, `768×1024`, `375×812`).

## Tasks & Steps

### Task 4.1 — Viết kịch bản E2E `apps/e2e/specs/manual-student-and-trial-grading.spec.ts`

- **Goal:** Kiểm chứng tự động trên trình duyệt thật toàn bộ hành trình của giáo viên từ org rỗng tới Tạo học viên thủ công → Kích hoạt lớp ngay → Lập hóa đơn → Giao bài tập → Tạo & Chấm bài nộp mẫu trên `/grading`.
- **Target files and symbols:**
  - Create `apps/e2e/specs/manual-student-and-trial-grading.spec.ts`.
- **Steps:**
  1. Tạo file `apps/e2e/specs/manual-student-and-trial-grading.spec.ts` theo mẫu auth/setup của các spec hiện có trong `apps/e2e/specs/` (như `class-operations.spec.ts`):
     - Bước 1: Đăng ký tài khoản giáo viên mới qua `/login` (org hoàn toàn rỗng, 0 học viên).
     - Bước 2: Tạo 1 lớp học mới tại `/classes` (bấm `+ Tạo lớp`, nhập tên lớp, học phí `3000000`, lịch học, bấm `Tạo lớp`) và tạo 1 đề Writing trạng thái `ready` (qua API `POST /api/assignments/prompts` hoặc UI `/assignments/new`).
     - Bước 3: Mở chi tiết lớp `/classes/$classId` → bấm tab `getByRole("tab", { name: "Học viên" })` → bấm `getByRole("button", { name: "+ Thêm học viên vào lớp" })` → modal tự mở ở chế độ `Tạo học viên mới` (vì org chưa có học viên) → nhập Họ tên `"Trần Minh Khôi"` (bỏ trống Email & SĐT), giữ tích `"Kích hoạt trạng thái Đang học ngay"` → bấm `getByRole("button", { name: "Lưu" })`.
     - Bước 4: Xác nhận `"Trần Minh Khôi"` xuất hiện ngay trong bảng học viên của lớp kèm badge `"Đang học"`.
     - Bước 5: Điều hướng tới `/tuition` → bấm `getByRole("button", { name: "+ Tạo hóa đơn" })` → `AddInvoiceModal` đã tự chọn `"Trần Minh Khôi"` (nhờ enrollment `active`) → nhập số tiền `3000000`, bấm `getByRole("button", { name: "Lưu" })` → xác nhận hóa đơn mới xuất hiện trong bảng học phí.
     - Bước 6: Quay lại `/classes/$classId` → ở tab `Buổi học & Bài tập`, bấm `getByRole("button", { name: "Giao bài tập" })` → chọn đề Writing vừa tạo, tích học viên `"Trần Minh Khôi"`, bấm xác nhận giao bài → xác nhận đề xuất hiện trong danh sách bài đã giao của lớp.
     - Bước 7: Điều hướng tới `/grading` → kiểm tra hiển thị không tràn ngang ở 3 viewport (`1440×900`, `768×1024`, `375×812`) → bấm nút `getByTestId("create-demo-grading-sample")` (`"Tạo bài nộp mẫu dùng thử"`) → xác nhận `"Nguyễn Minh Anh (Học viên mẫu)"` xuất hiện trong `getByTestId("grading-queue-table")` → bấm `getByRole("link", { name: /Chấm bài của Nguyễn Minh Anh/ })` → trên trang chấm chi tiết bấm `"Chốt trả bài"` → quay lại `/grading` bấm `getByTestId("delete-demo-grading-sample")` (`"Xóa bài nộp mẫu"`) → xác nhận `getByTestId("grading-empty-state")` xuất hiện trở lại.
- **Success criteria:** Spec `manual-student-and-trial-grading.spec.ts` chạy pass 100% trên cổng E2E (8100/8101/8103).
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e -- specs/manual-student-and-trial-grading.spec.ts` exits 0.

### Task 4.2 — Chạy toàn bộ cổng chất lượng (`biome check`, `check-types`, `test`, `build`)

- **Goal:** Đảm bảo không có bất kỳ lỗi lint, type, unit/integration test hay build nào trên toàn monorepo.
- **Target files and symbols:** Toàn bộ các file đã sửa trong Phase 1–4.
- **Steps:**
  1. Chạy `pnpm exec biome check .` (nếu có lỗi format thì chạy `pnpm check` để biome tự sửa).
  2. Chạy `pnpm check-types`.
  3. Chạy `pnpm test`.
  4. Chạy `pnpm build`.
- **Success criteria:** Cả 4 lệnh đều kết thúc với exit code 0.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm test && pnpm build` exits 0.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e -- specs/manual-student-and-trial-grading.spec.ts` exits 0.
- `pnpm exec biome check . && pnpm check-types && pnpm test && pnpm build` exits 0.

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
