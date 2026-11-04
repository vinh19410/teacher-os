# Phase 1: Hợp đồng khóa học

## Context
Form mới hỏi "Khóa bạn quan tâm" theo 3 khóa của handoff. Server chỉ nhận giá trị trong `LEAD_COURSES`.

## Requirements
- Thêm 3 mã khóa mới, giữ nguyên 12 mã cũ và thứ tự cũ.
- Nhãn và nhóm hiển thị đúng ở `/leads` trong `apps/web`.
- Không migration.

## Files
- Sửa: `packages/api/src/lead-contracts.ts` (`LEAD_COURSES`, `LEAD_COURSE_LABELS`, `LEAD_COURSE_GROUPS`)
- Sửa: `apps/profile/public/kiem-tra-dau-vao/lead-gate.js` (`PLACEMENT_COURSE_GROUPS` đồng bộ với `LEAD_COURSE_GROUPS`)
- Sửa: `apps/server/src/lead-catalog-drift.test.ts` (cập nhật assertion cho nhóm và select landing)
- Đọc: `apps/web/src/routes/_auth/leads/index.tsx` (bộ lọc khóa nếu dùng `LEAD_COURSE_GROUPS`)
## Steps
1. Đọc `LEAD_COURSE_GROUPS` và chỗ nào dùng nó (web, lead-gate.js, test drift của profile).
2. Thêm 3 mã vào `LEAD_COURSES`, nhãn tiếng Việt trong `LEAD_COURSE_LABELS`, và nhóm mới `target: { label: "Khóa theo mục tiêu", codes: [...] }` trong `LEAD_COURSE_GROUPS` (trước nhóm `other`).
3. Đồng bộ `PLACEMENT_COURSE_GROUPS` trong `apps/profile/public/kiem-tra-dau-vao/lead-gate.js` khớp chính xác với `LEAD_COURSE_GROUPS`.
4. Thêm test: lead với từng mã mới được nhận (201), mã lạ bị từ chối (400), lead cũ vẫn hợp lệ.
5. Cập nhật `apps/server/src/lead-catalog-drift.test.ts` để kiểm tra nhóm mới và tính tương thích của danh mục.
6. Xác nhận trang `/leads` hiển thị nhãn mới thay vì mã thô.

## Validation
- `pnpm --filter @teacher-os/api test` (hoặc tên package thực tế trong `packages/api/package.json`) và `pnpm --filter server test -- public-leads`
- `pnpm check-types`

## Risk / Rollback
Thay đổi thuần cộng thêm. Rollback bằng revert; lead đã lưu mã mới sẽ hiển thị mã thô ở `/leads` nhưng không mất dữ liệu.
