---
phase: 1
title: "Phase 1: Schema, Migration & API Contracts"
status: done
priority: P1
effort: 30m
dependencies: []
---

# Phase 1: Schema, Migration & API Contracts

## Goal

Cập nhật schema bảng `enrollment` để hỗ trợ trạng thái `removed` + cột `removed_at`, sinh migration forward-only với partial unique index cho phép tái ghi danh, kiểm thử migration/ràng buộc DB, và mở rộng contracts dùng chung giữa server/web/student.

## Files to Create / Modify

- Modify: `packages/db/src/schema/enrollment.ts`
- Create: `packages/db/src/migrations/0101_*.sql` (sinh bằng `drizzle-kit generate`)
- Modify: `packages/db/src/migrations/meta/_journal.json` & Create `packages/db/src/migrations/meta/0101_snapshot.json`
- Modify/Create: `packages/db/src/schema/enrollment.test.ts` (hoặc test DB hiện có trong `packages/db`)
- Modify: `packages/api/src/contracts.ts`

## Tasks & Steps

1. Trong `packages/db/src/schema/enrollment.ts`:
   - Cập nhật JSDoc lifecycle: `'invited' -> 'active' -> 'removed'`.
   - Thêm cột nullable `removedAt: integer("removed_at", { mode: "timestamp_ms" })`.
   - Đổi `enrollment_class_student_uq` thành partial unique index `.where(sql\`${table.status} != 'removed'\`)`.
2. Chạy `pnpm --filter @teacher-os/db db:generate` và kiểm tra file SQL mới sinh: chỉ được phép chứa `DROP INDEX`, `ALTER TABLE \`enrollment\` ADD \`removed_at\``, `CREATE UNIQUE INDEX ... WHERE` (không rebuild bảng `enrollment`).
3. Viết unit test DB kiểm chứng: (a) trùng `active`/`invited` `(classId, studentId)` vẫn lỗi UNIQUE, (b) chuyển `removed` rồi thêm mới `invited`/`active` cùng `(classId, studentId)` thành công, (c) nhiều bản ghi `removed` cùng `(classId, studentId)` hợp lệ.
4. Trong `packages/api/src/contracts.ts`:
   - Giữ `ENROLLMENT_STATUSES = ["invited", "active"] as const` cho `studentClassSchema` (Student Portal chỉ thấy `invited`/`active`).
   - Thêm `KERNEL_ENROLLMENT_STATUSES = ["invited", "active", "removed"] as const`, `KernelEnrollmentStatus`, và `ENROLLMENT_ERROR_CODES = { ALREADY_REMOVED: "ENROLLMENT_ALREADY_REMOVED", STATUS_CHANGED: "ENROLLMENT_STATUS_CHANGED" } as const`.
   - Thêm `removedAt?: string | null` vào `KernelEnrollmentRow` và cập nhật `status: KernelEnrollmentStatus | string`.

## Verification

- `pnpm --filter @teacher-os/db test`
- `pnpm --filter @teacher-os/api test`
- `pnpm --filter @teacher-os/db check-types && pnpm --filter @teacher-os/api check-types`
