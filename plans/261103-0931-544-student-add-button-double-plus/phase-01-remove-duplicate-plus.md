# Phase 01 — Bỏ ký tự + thừa ở nút Thêm học viên

## Context

Xem [plan.md](plan.md). Đọc `DESIGN.md` và `REVIEW.md` trước khi sửa.

## Files

- Sửa: `apps/web/src/routes/_auth/students/index.tsx` (2 nút: header và empty state)
- Sửa: `apps/web/src/routes/_auth/students/index.test.tsx` (regex `/\+ Thêm học viên/` ở 2 chỗ và tên test)

## Steps

1. Trong `index.tsx`, đổi `<Plus className="h-4 w-4" />+ Thêm học viên` thành `<Plus className="h-4 w-4" />Thêm học viên` ở cả 2 nút.
2. Trong `index.test.tsx`, đổi `/\+ Thêm học viên/` thành `/Thêm học viên/` và sửa tên test cho khớp.
3. Grep lại `+ Thêm học viên` (không kèm "vào lớp") trong `apps/` để chắc không còn selector nào phụ thuộc.
4. Verify 3 viewport (1440×900, 768×1024, 375×812) + keyboard focus; chạy `pnpm design:compare` nếu PR đụng hình ảnh, đính screenshot vào PR.

## Validation

- `pnpm exec biome check .`
- `pnpm check-types`
- `pnpm --filter web test`

## Risk / Rollback

- Rủi ro thấp: chỉ đổi nhãn; test tìm theo regex nên cần cập nhật đồng thời.
- Rollback: revert một commit.
