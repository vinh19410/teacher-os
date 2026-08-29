---
phase: 1
title: "Contracts + server enroll endpoint"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Contracts + server enroll endpoint

## Overview

Thêm schema zod `enrollStudentSchema` vào `packages/api/src/contracts.ts` và endpoint `POST /api/classes/:id/enroll` vào `apps/server/src/routes/kernel.ts`. Endpoint tạo enrollment + session package active + chuỗi buổi học trong một `db.batch` — bản sao nhánh `cls` của `POST /students` nhưng tái dùng học viên có sẵn.

## Requirements

- Functional: enroll học viên có sẵn (cùng org) vào lớp có lịch; sinh đủ `sessionsTotal` buổi; gói active gắn enrollment.
- Non-functional: atomic (một batch); org-scoped; lỗi 404/409 thân thiện dạng JSON `{error}`; không chạm mapping đọc snapshot.

## Architecture

- Contract: `enrollStudentSchema = z.object({ studentId: z.string().min(1), total: z.number().int().min(0).default(10), price: z.number().int().min(0).default(400000), mode: z.enum(["Online","Offline"]).default("Online") })` — field-identical với phần gói của `studentCreateSchema`.
- Route: `kernel.post("/classes/:id/enroll")` trong `kernel.ts`, đặt cạnh `POST /classes/:id/notes`. Flow:
  1. `readBody(c, enrollStudentSchema)`.
  2. `findClass(db, id, ctx.orgId)` → 404 `"class not found"` nếu thiếu.
  3. Tìm student `eq(student.id, studentId)` + `eq(student.orgId, ctx.orgId)` → 404 `"student not found"`.
  4. Check enrollment tồn tại `(classId, studentId)` → 409 `"student already enrolled"` (đứng trước unique index của DB để lỗi thân thiện).
  5. Một `db.batch`: `enrollment` (id mới) + `sessionPackage` (bộ `packageValues` field-identical với `POST /students`: start `formatDayMonth(new Date())`, expiry `""`, status `"active"`, `enrollmentId` gắn) + lessons từ `generateScheduleLessons({schedule, startDate, sessionsTotal, orgId, classId, enrollmentId})`.
  6. Trả `201 { id: enrollmentId }` (CreatedResponse shape — giữ nhất quán `satisfies CreatedResponse`).

## Related Code Files

- Modify: `packages/api/src/contracts.ts`
- Modify: `apps/server/src/routes/kernel.ts`
- Modify: `apps/server/src/kernel.test.ts` (tests-first)

## Implementation Steps

1. **TDD — viết test trước** trong `kernel.test.ts` (describe `POST /classes/:id/enroll`), chạy FAIL:
   - Happy path: tạo lớp có lịch (T2+T4, 12 buổi) + học viên qua seed → enroll → snapshot có enrollment `(classId, studentId)`; gói active với `total/price/mode` như payload, `enrollmentId` khớp; số lesson row của enrollment = 12.
   - 404 lớp không tồn tại; 404 học viên không tồn tại; 404 học viên thuộc org khác (cross-org).
   - 409 enroll trùng (enroll 2 lần); DB-level: message không phải raw SQLite.
   - Gói field-identical: assert đủ `start`, `expiry === ""`, `status === "active"`.
2. Thêm `enrollStudentSchema` + type `EnrollStudent` vào `contracts.ts` (export qua contracts index).
3. Thêm route vào `kernel.ts` như Architecture; import schema từ `@teacher-os/api/contracts`.
4. Chạy `pnpm --filter server test` → GREEN.

## Success Criteria

- [ ] Tests mới pass, không test cũ break.
- [ ] `curl`-level parity: 201/404/409 đúng shape `{error}`.
- [ ] Không thay đổi behavior `POST /students`.

## Risk Assessment

- Unique index có thể nổ trước check 409 nếu race → chấp nhận: check-before-insert đủ cho single-user QC; race trả 500 hiếm gặp, không che lỗi.
- Lệch field gói → test assert từng trường theo Risk bảng chính.
