---
phase: 1
title: "Contract & DB migration"
status: todo
priority: P1
effort: 1h
dependencies: []
---

# Phase 1: Contract & DB migration

## Goal

Khai báo học phí theo học viên làm dữ liệu persisted: cột `class.tuition_fee` (nullable, integer VND) + mở rộng contract tạo lớp và thêm contract cập nhật fee, chưa đụng server/web consumer.

## Context Links

- `docs/code-standards.md:26-35` — persist-vs-derive carve-out: giá trị user sửa được ⇒ cột thật + docblock nêu user-action ghi nó
- `packages/api/src/contracts.ts:48-101` — `classCreateSchema` hiện tại
- `packages/api/src/contracts.ts:635-654` — `KernelClassRow` (wire type snapshot)
- `packages/db/src/schema/invoice.ts:24` — `amount` integer: quy ước tiền hiện có

## Files to Create / Modify

- Modify: `packages/db/src/schema/class.ts` — thêm cột `tuitionFee`
- Create: `packages/db/src/migrations/0020_*.sql` — sinh bằng `pnpm db:generate`, KHÔNG viết tay
- Modify: `packages/api/src/contracts.ts` — `classCreateSchema`, schema update fee mới, `KernelClassRow`

## Implementation Steps

1. `packages/db/src/schema/class.ts` — thêm cột vào `classTable` (giữa `startDate` và `notes` hoặc cuối, miễn nhất quán):

	```ts
	/** Học phí mỗi học viên (VND) cho toàn khóa; null = chưa thiết lập.
	 * User-action ghi: tạo lớp (POST /api/classes), sửa học phí lớp (POST /api/classes/:id/tuition-fee).
	 * Per-student theo yêu cầu — KHÔNG phải tổng học phí cả lớp; không derive từ invoice (persist-vs-derive carve-out). */
	tuitionFee: integer("tuition_fee"),
	```

	Không `.notNull()`, không `.default()` — nullable thật để phân biệt "chưa thiết lập".

2. Chạy `pnpm db:generate` (root) — kiểm tra file migration sinh ra chỉ chứa `ALTER TABLE class ADD tuition_fee integer;` (additive, an toàn D1, không backfill). Commit file generated.

3. `packages/api/src/contracts.ts`:
	- `classCreateSchema` thêm field (đặt trước `startDate`):

	```ts
	/** Học phí mỗi học viên (VND) cho toàn khóa; null/undefined = chưa thiết lập, sửa được sau khi tạo. */
	tuitionFee: z.number().int().min(1).nullish(),
	```

	- Thêm schema mới cạnh `updateNotesSchema`-tương đương (theo vị trí các schema per-class):

	```ts
	/** Cập nhật học phí mỗi học viên của lớp; null = xóa học phí. */
	export const classTuitionFeeUpdateSchema = z
		.object({ tuitionFee: z.number().int().min(1).nullable() })
		.strict();
	export type ClassTuitionFeeUpdate = z.infer<typeof classTuitionFeeUpdateSchema>;
	```

	- `KernelClassRow` thêm `tuitionFee: number | null;` kèm docblock ngắn (semantics per-student).

## Todo

- [ ] Cột `tuitionFee` trong `schema/class.ts` + docblock user-action
- [ ] Migration generated & kiểm tra nội dung additive
- [ ] `classCreateSchema.tuitionFee` (`.int().min(1).nullish()`)
- [ ] `classTuitionFeeUpdateSchema` (`.strict()`, nullable) + type export
- [ ] `KernelClassRow.tuitionFee: number | null`

## Verification

- `pnpm --filter @teacher-os/db check-types && pnpm --filter @teacher-os/api check-types` — exit 0
- `ls packages/db/src/migrations/ | tail -1` — có file 0020 mới, nội dung chỉ ADD COLUMN
- `ak plan status plans/260921-0918-class-tuition-fee` — phase 1 done

## Risk Assessment

- Quên `.strict()` ở update schema → lệch chuẩn `invoiceCreateSchema`; bắt buộc strict.
- Migration viết tay sai cú pháp D1 → luôn dùng `pnpm db:generate`.

## Security Considerations

- Chỉ thêm nullable column — không dữ liệu cũ bị đổi; không secret trong migration.

## Next Steps

- Phase 2 consume contract + cột ở server.
