---
phase: 2
title: "Server — snapshot LEFT JOIN, contract nullable, POST /students parked package"
status: completed
priority: P0
effort: "3h"
dependencies: [1]
---

# Phase 2: Server — snapshot LEFT JOIN, contract nullable, POST /students parked package

## Overview

Đổi read path (snapshot + contract) và write path (POST /students) để package
parked (không enrollment) chảy qua toàn bộ pipeline và hiển thị đúng — đồng thời
viết lại test đang đóng băng bug (`kernel.test.ts:755`, assert bug nằm ở :780-782).

**Lưu ý wire contract (red-team #4):** package chỉ chảy qua **GET /kernel**
(`snapshot.packages`); `GET /students` trả CHỈ `snapshot.students` (id/name/phone/
zalo/parent — `kernel.ts:350-355`), không đổi endpoint này.

## Requirements

- Functional: POST /students không `classId` vẫn insert `session_package`
  (studentId, enrollmentId NULL, total/price/mode/start như nhánh có lớp) trong
  CÙNG `db.batch` (giữ tính nguyên tử); GET /kernel trả package parked với
  `studentId` đúng, `enrollmentId/classId` null.
- Non-functional: không đổi hành vi đường CÓ lớp; contract nullable compile sạch
  ngay trong phase này (null-guard web nằm đây, không để lửng).

## Architecture

Snapshot trước đây INNER JOIN enrollment để derive `studentId`/`classId`. Sau đổi:
LEFT JOIN enrollment (lấy `classId` khi có), `studentId` lấy trực tiếp từ cột
`session_package.student_id`. Web `mapStudents` đã key theo `pkg.studentId` nên
không đổi logic; chỉ cần null-guard typecheck tại đúng 1 điểm (`students.ts:52`,
đã audit là điểm fail duy nhất — `dashboard-from-kernel.ts`, `repos/kernel.ts`,
`$studentId.tsx`, `tuition.tsx` đều tiêu thụ qua `mapStudents`).

## Related Code Files

- Modify: `apps/server/src/routes/snapshot.ts:104-122` (LEFT JOIN + studentId trực tiếp)
- Modify: `packages/api/src/contracts.ts` (`KernelPackageRow.enrollmentId/classId`
  → `string | null` + cập nhật comment :321-323 "Entitlement joined with its
  enrollment's class/student" → phản ánh enrollment optional)
- Modify: `apps/server/src/routes/kernel.ts:357-430` (POST /students — nhánh else)
- Modify: `apps/server/src/kernel.test.ts` (helper `addStudent` :272-289 + test :755-783)
- Modify: `apps/web/src/lib/repos/students.ts:52` (null-guard, pin ở phase này)
- Ghi chú: `packages/api` export thẳng `./src/*.ts`, KHÔNG có build/dist — không
  cần rebuild artifact nào.

## Implementation Steps (TDD)

1. **Helper trước**: mở rộng `addStudent` (`kernel.test.ts:272-289`) nhận thêm
   `mode?: "Online" | "Offline"` (hiện hardcode `"Online"` — thiếu là TS
   excess-property error).
2. **Tests Before** — viết lại test :755 thành 2 test, tên phản ánh bất biến mới:
   (a) *"without classId creates parked package keyed by student"*:
   `addStudent(session, name, { total: 10, price: 400000, mode: "Offline" })` —
   **cố ý dùng Offline** để phân biệt giá trị input với default DB/schema
   (`"Online"`) — nếu nhánh else drop `input.mode`, test phải đỏ.
   Assert qua GET /kernel snapshot: 1 package mới với `enrollmentId === null`,
   `classId === null`, `total 10`, `price 400000`, `mode "Offline"`, `start` =
   `formatDayMonth(new Date())` (định nghĩa `kernel.ts:1478`), `status active`.
   (b) *"with classId keeps enrollment + package + lesson series"*: giữ các assert
   của đường có lớp **nhưng KHÔNG giữ :780-782** (`expect(after.packages)
   toHaveLength(1) // unchanged` mã hóa bug) — sau fix, tổng packages phải tăng
   theo số học viên tạo.
3. **Contracts**: nullable + comment; `pnpm check-types` kỳ vọng fail đúng
   `students.ts:52`.
4. **Null-guard** `students.ts:52`:
   `const done = pkg?.enrollmentId ? (completedByEnrollment.get(pkg.enrollmentId) ?? 0) : 0;`
   — KHÔNG đổi `Map` sang `Map<string | null, number>`. Cập nhật comment
   "across the student's enrollments" (`students.ts:23-30`) thành
   "across the student's packages (enrollment optional)".
5. **Snapshot**: `leftJoin(enrollment, eq(sessionPackage.enrollmentId, enrollment.id))`,
   `studentId: sessionPackage.studentId`, `classId: enrollment.classId` (nullable).
6. **POST /students**: nhánh `else` (không `cls`) push `db.insert(sessionPackage)`
   với `enrollmentId: null` vào cùng mảng `statements` trước `db.batch`
   (nguyên tử như nhánh có lớp).
7. **Regression Gate**: `pnpm --filter server test` xanh toàn bộ;
   `pnpm check-types` xanh; `pnpm --filter web test` xanh (web unit case
   enrollmentId-null là việc Phase 3, nhưng guard bước 4 phải không phá test có sẵn).

## Todo

- [x] Helper addStudent + mode param
- [x] Rewrite test :755 (parked package Offline + đường có lớp, bỏ assert :780-782)
- [x] Contract nullable + comment; null-guard students.ts + comment
- [x] Snapshot LEFT JOIN + studentId trực tiếp
- [x] POST /students nhánh else insert package trong batch
- [x] `pnpm --filter server test` + `pnpm check-types` + `pnpm --filter web test` xanh

## Success Criteria

- [x] Test không-lớp: package parked trong snapshot đúng giá trị (mode Offline phân
      biệt được default)
- [x] Test có-lớp: hành vi cũ không đổi; assert bug cũ đã biến mất
- [x] Server suite xanh; check-types xanh

## Risk Assessment

R2: nullability rỉ typing — đã audit: điểm fail duy nhất `students.ts:52`;
guard tường minh, không đổi Map key type. Contract test cũ tại `kernel.test.ts:2471,2507`
(assert `p.classId === ...`) vẫn compile với `string | null` — giữ nguyên.
