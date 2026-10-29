---
phase: 1
title: "Schema Lịch nghỉ chung + zod contract"
status: completed
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Schema Lịch nghỉ chung và contract

## Goal

Có chỗ lưu kỳ nghỉ, lớp áp dụng và từng cặp buổi gốc → buổi bù (D2), cùng contract request/response dùng chung cho server và web.

## Files to Create / Modify

- Create: `packages/db/src/schema/organization-holiday.ts`
  - `organization_holiday`: `id`, `orgId` (FK cascade), `name`, `fromDate`, `toDate` (yyyy-mm-dd), `scope` (`"org" | "classes"`), `mode` (`"shift" | "cancel"`, TOS-11 chỉ ghi `shift`), `notify` (integer boolean), `notifiedAt` (integer timestamp, nullable — TOS-19 đọc để biết kỳ nghỉ nào chưa gửi thông báo, tránh migrate lại), `createdByUserId`, `createdAt`. Index `(orgId, fromDate)`.
  - `organization_holiday_class`: `holidayId` (FK cascade), `classId` (FK cascade), PK ghép. Chỉ có dòng khi `scope = "classes"`.
  - `holiday_session_shift`: `id`, `orgId`, `holidayId` (FK cascade), `classId` (FK cascade), `originalDate`, `makeupDate`, `createdAt`. **Unique `(classId, originalDate)`** — một buổi gốc chỉ bị dời một lần — và **`uniqueIndex (classId, makeupDate)`** — chặn hai buổi bù rơi vào cùng một ngày (red-team C3; hai apply đồng thời không được sinh 2 dòng cùng `(classId, makeupDate)`).
  - Docstring nói rõ: buổi gốc có `lesson.status = "holiday"`, buổi bù là `lesson` `upcoming` thường; bảng shift là nguồn duy nhất cho nhãn "Đã dời sang" và hoàn tác (TOS-13).
- Modify: `packages/db/src/schema/index.ts` — export file mới.
- Create: migration qua `pnpm --filter @teacher-os/db db:generate` (tên do drizzle-kit sinh, kiểm tra SQL trước khi commit).
- Modify: `packages/db/src/schema/lesson.ts` — docstring `status` thêm `holiday` (buổi gốc bị dời bởi Lịch nghỉ chung, không trừ buổi, không điểm danh) và ghi chú buổi bù không đổi contract "class fields immutable".
- Modify: `packages/api/src/contracts.ts`
  - `HOLIDAY_NAME_MIN = 2`, `HOLIDAY_NAME_MAX = 100`, `HOLIDAY_MAX_DAYS = 30`.
  - `holidayDraftSchema`: `name` (trim, 2..100), `fromDate`, `toDate` (strict date, `toDate >= fromDate`, số ngày tính cả hai đầu ≤ 30), `scope`, `classIds` (bắt buộc ≥ 1 khi `scope = "classes"`), `mode: z.literal("shift")`, `notify: boolean` mặc định `true`.
  - Kiểu response `HolidayPreview` (xem phase 2) và `HolidayApplyResult` (`holidayId`, `shiftedCount`, `classCount`).
  - Kiểu lesson status ở contract (`contracts.ts:1398`) thêm `"holiday"`.
- Create: `packages/api/src/holiday-contracts.test.ts` (theo mẫu `vocab-contracts.test.ts`).

## Tasks & Steps

1. Viết schema + export, chạy `db:generate`, đọc SQL sinh ra (3 `CREATE TABLE`, index, không đụng bảng cũ).
2. Test contract đỏ rồi xanh: tên 1 ký tự / 101 ký tự bị từ chối; khoảng 31 ngày bị từ chối, 30 ngày nhận; `toDate < fromDate` bị từ chối; `scope = "classes"` mà `classIds` rỗng bị từ chối; ngày `2026-02-30` bị từ chối.
3. Áp migration vào DB dev local (backup file DB trước khi migrate theo rule dự án).

## Verification

- `pnpm --filter @teacher-os/api test -- holiday-contracts`
- `pnpm --filter @teacher-os/db db:migrate:deploy` trên DB dev (đã backup)
- `pnpm check-types`

## Risk / Rollback

- Migration chỉ thêm bảng mới → rollback bằng migration drop 3 bảng; không mất dữ liệu cũ.
