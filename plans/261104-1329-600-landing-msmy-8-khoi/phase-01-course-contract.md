# Phase 1: Hợp đồng khóa học

## Context
Form mới hỏi "Khóa bạn quan tâm" theo 3 khóa của handoff. Server chỉ nhận giá trị trong `LEAD_COURSES`.

## Requirements
- Thêm 3 mã khóa mới, giữ nguyên 12 mã cũ và thứ tự cũ.
- Nhãn và nhóm hiển thị đúng ở `/leads` trong `apps/web`.
- Không migration.

## Files
- Sửa: `packages/api/src/lead-contracts.ts` (`LEAD_COURSES`, `LEAD_COURSE_LABELS`, `LEAD_COURSE_GROUPS`)
- Sửa nếu có: test contract trong `packages/api/src` và `apps/server/src/routes/public-leads.test.ts`
- Đọc: `apps/web/src/routes/_auth/leads/index.tsx` (bộ lọc khóa nếu dùng `LEAD_COURSE_GROUPS`)

## Steps
1. Đọc `LEAD_COURSE_GROUPS` và chỗ nào dùng nó (web, test drift của profile).
2. Thêm 3 mã vào enum, nhãn tiếng Việt, và nhóm riêng "Khóa theo mục tiêu" (hoặc gộp vào nhóm hợp lý, theo kết quả bước 1).
3. Thêm test: lead với từng mã mới được nhận (201), mã lạ bị từ chối (400), lead cũ vẫn hợp lệ.
4. Xác nhận trang `/leads` hiển thị nhãn mới thay vì mã thô.

## Validation
- `pnpm --filter @teacher-os/api test` (hoặc tên package thực tế trong `packages/api/package.json`) và `pnpm --filter server test -- public-leads`
- `pnpm check-types`

## Risk / Rollback
Thay đổi thuần cộng thêm. Rollback bằng revert; lead đã lưu mã mới sẽ hiển thị mã thô ở `/leads` nhưng không mất dữ liệu.
