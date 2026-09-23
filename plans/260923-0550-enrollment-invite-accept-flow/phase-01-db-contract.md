---
phase: 1
title: "Phase 1: DB schema & API contract"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: DB schema & API contract

## Context Links

- [plan.md](./plan.md) · [Scout enrollment](./reports/scout-report-enrollment.md) · [Scout auth/portal](./reports/scout-report-auth-portal.md)
- Tiền lệ: `plans/260922-0716-student-create-identity-fields/plan.md` (email/SĐT danh tính login tương lai)

## Overview

Thêm cột `status` vào bảng `enrollment` (Drizzle + D1 migration) và mở rộng kiểu dữ liệu contract (`EnrollmentStatus`, `KernelEnrollmentRow.status`). Phase này chỉ là nền tảng dữ liệu + type — chưa đổi behavior của endpoint nào.

## Key Insights

- `enrollment` hôm nay chỉ có `id, orgId, classId, studentId, createdAt` (`packages/db/src/schema/enrollment.ts`) — tồn tại = đang học.
- Unique index `enrollment_class_student_uq (classId, studentId)` giữ nguyên: một học viên chỉ có đúng một enrollment/lớp, dù invited hay active.
- Default cột `status` là `"active"` → migration tự backfill toàn bộ enrollment hiện hữu thành `active`, dữ liệu cũ không đổi hành vi (tiêu chí thành công #4).
- `KernelEnrollmentRow` (`packages/api/src/contracts.ts:663-668`) là shape snapshot mà web tiêu thụ — phải thêm `status` ở đây để các phase sau đọc được.

## Requirements

- [ ] Cột `enrollment.status` kiểu text NOT NULL, giá trị hợp lệ `invited | active`, default `active`
- [ ] Type `EnrollmentStatus` xuất từ `packages/api/src/contracts.ts` và được tái sử dụng (không khai báo trùng union ở chỗ khác)
- [ ] `KernelEnrollmentRow` có thêm field `status`
- [ ] Migration D1 được sinh bằng `db:generate` và chạy được lên DB hiện hữu

## Architecture

```
packages/db/src/schema/enrollment.ts        + status text notnull default "active"
packages/db/src/migrations/000X_*.sql       ALTER TABLE enrollment ADD COLUMN status ...
packages/api/src/contracts.ts               + ENROLLMENT_STATUSES, EnrollmentStatus
                                            ~ KernelEnrollmentRow: + status
```

Phần tử dữ liệu mới:

```ts
// packages/api/src/contracts.ts
export const ENROLLMENT_STATUSES = ["invited", "active"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];
```

Nhãn tiếng Việt (dùng ở phase 3, đặt trong apps/web chứ không nhúng vào contract): `invited` → "Đã mời", `active` → "Đang học".

## Related Code Files

- Modify: `packages/db/src/schema/enrollment.ts` — thêm cột `status`
- Create: `packages/db/src/migrations/000X_*.sql` (sinh bởi drizzle-kit)
- Modify: `packages/api/src/contracts.ts` — `EnrollmentStatus` + `KernelEnrollmentRow.status`

## Implementation Steps

1. Sửa `packages/db/src/schema/enrollment.ts`: thêm `status: text("status").notNull().default("active")`, kèm comment ngắn giải thích vòng đời invited→active (comment nêu invariant: default `active` chỉ để backfill dữ liệu cũ; code mới luôn ghi status tường minh).
2. Chạy `pnpm db:generate` để sinh migration; kiểm tra file SQL sinh ra đúng là `ALTER TABLE enrollment ADD COLUMN status TEXT NOT NULL DEFAULT 'active'` và KHÔNG đụng bảng khác.
3. Sửa `packages/api/src/contracts.ts`: thêm `ENROLLMENT_STATUSES`, `EnrollmentStatus`; thêm `status: EnrollmentStatus | string` vào `KernelEnrollmentRow` theo convention forward-compat `| string` đang có trong file.
4. `pnpm check-types` để bắt toàn bộ điểm vỡ. Red-team #10 đã xác minh 7 điểm tiêu thụ `KernelEnrollmentRow` (`contracts.ts:663` định nghĩa, `:851` KernelSnapshot; producer `snapshot.ts:295-300`; pass-through `repos/enrollments.ts:9,16`; **fixture literals là chỗ thực sự vỡ type**: `apps/web/src/lib/mock-data.ts:228` và `apps/web/src/lib/repos/enrollments.test.ts:31`; structural ref an toàn `tuition-from-kernel.ts:28`). Bổ sung `status` vào các fixture literal này (giá trị `"active"`) — không đụng behavior.

## Todo

- [x] Thêm cột `status` vào schema `enrollment`
- [x] Sinh migration D1 bằng `db:generate`, review SQL
- [x] Thêm `EnrollmentStatus` + `KernelEnrollmentRow.status` vào contracts
- [x] `pnpm check-types` + `pnpm check` (biome) xanh

## Success Criteria

- Migration chạy được trên DB có sẵn (local/dev) mà không lỗi, enrollment cũ có `status = 'active'`.
- `pnpm check-types` xanh toàn workspace.
- Không có endpoint nào đổi hành vi ở phase này.

## Risk Assessment

- Quên default `active` → backfill sai dữ liệu cũ. Mitigation: review SQL migration trước khi commit (bước 2).
- Drizzle-kit sinh migration đụng nhầm bảng khác. Mitigation: diff file SQL trước khi commit.

## Security Considerations

- Status là dữ liệu thường, không chứa PII; không có thay đổi auth ở phase này.

## Next Steps

- Phase 2 dùng cột + type này để đổi behavior enroll và thêm accept endpoint.
