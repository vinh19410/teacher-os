---
phase: 2
title: "Cập nhật E2E + verification"
status: pending
priority: P1
effort: 1h
dependencies: [1]
---

# Phase 2: Cập nhật E2E + verification

## Context Links

- Plan cha: [plan.md](./plan.md)
- Spec nền: `apps/e2e/specs/student-package-without-class.spec.ts`, `apps/e2e/specs/student-package-validation.spec.ts` (2 chỗ đang assert gói trên list)

## Key Insights

- Chỉ 2 spec assert nội dung gói trên hàng list: `student-package-validation.spec.ts:104` ("Chưa có gói") và `:212-213` (`/buổi · Online/` + `500.000đ` — coverage derive-gói #240 D1); `student-package-without-class.spec.ts:30-31` tương tự.
- Coverage "derive gói từ lớp" (đơn giá 500.000đ) không mất: chuyển assertion sang trang Học phí — `tuition-from-kernel.ts` vẫn derive `pkg` từ enrollment, row học phí hiển thị giá gói.
- Nav sidebar có item "Lớp học"; các spec click nav bằng `getByText("Lớp học", { exact: true }).first()` trên chính trang /students — sau khi thêm header cột "Lớp học", `.first()` vẫn trúng nav vì sidebar đứng trước main content trong DOM; phải chạy thực tế để xác nhận không flaky.
- `student-row-detail.spec.ts` (row click → detail + 4 tabs) và `enroll-existing-student.spec.ts` không assert nội dung cột gói — kỳ vọng không đổi.

## Requirements

- [ ] Không còn spec nào assert text gói trên hàng list (/students): "Chưa có gói", `/buổi ·/`, cột Đơn giá
- [ ] Spec assert hàng list hiển thị tên lớp; học viên không lớp thấy "Chưa có lớp"
- [ ] Coverage derive gói (#240 D1) giữ được qua trang Học phí
- [ ] Toàn bộ verification pass

## Related Code Files

- Modify: `apps/e2e/specs/student-package-without-class.spec.ts`
- Modify: `apps/e2e/specs/student-package-validation.spec.ts`

## Implementation Steps

1. `student-package-without-class.spec.ts`:
   - Cập nhật comment đầu file (list giờ render "Chưa có lớp"; tuition vẫn "Chưa có gói").
   - Bước 3 (list): `studentRow.getByText("Chưa có gói")` → `studentRow.getByText("Chưa có lớp")`; bỏ assertion `getByText("0 buổi · Online")` `toHaveCount(0)` (cột gói không còn tồn tại trên list — assertion trở nên vô nghĩa).
   - Bước 5 (tuition) giữ nguyên.
2. `student-package-validation.spec.ts`:
   - Dòng ~104 (học viên tạo ngoài lớp): `row.getByText("Chưa có gói")` → `row.getByText("Chưa có lớp")`; cập nhật comment bước 6.
   - Khối "List học viên: derive gói từ lớp + đơn giá 500.000đ" (~206-217): thay 2 assertion `/buổi · Online/` và `500.000đ` bằng `row.getByText(<tên lớp vừa tạo>)` (dùng biến tên lớp đã có trong spec); cập nhật comment thành "List học viên: hàng hiển thị lớp đã enroll".
   - Thêm bước asserting derive gói trên Học phí: điều hướng nav "Học phí", tìm row của học viên vừa enroll, `expect` thấy `500.000đ` (đơn giá derive từ lớp) — thay thế coverage D1 cũ của list.
   - Các bước detail (card "Lớp học" hiện lớp vừa tạo) giữ nguyên.
3. Chạy toàn bộ verification (mục Verification). Nếu `.first()` nav "Lớp học" bị flaky do trùng text với header cột, scoped click vào nav container và ghi lại trong plan.

## Verification

- `pnpm check-types`
- `pnpm --filter web test`
- `pnpm exec biome check apps/web/src apps/e2e/specs`
- `pnpm --filter e2e exec playwright test specs/student-package-without-class.spec.ts specs/student-package-validation.spec.ts specs/student-row-detail.spec.ts specs/enroll-existing-student.spec.ts`

## Risk Assessment

- **Strict-mode "Lớp học" (nav vs header cột)**: mitigation — scope click nav; nếu vẫn flaky, đổi text header thành "Lớp" (thẩm định lại với plan trước khi đổi).
- **Assert "Chưa có lớp" trùng nhiều row**: scope bằng `studentRow`/`row` locator đã có trong spec (theo tên học viên), không assert page-level.

## Security Considerations

- Không đổi dữ liệu hay API — chỉ assertion UI.
