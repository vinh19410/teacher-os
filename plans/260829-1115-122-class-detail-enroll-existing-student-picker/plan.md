---
title: "Issue #122: Class detail picker enroll học viên có sẵn"
description: "Bugfix P1: modal '+ Thêm học viên' ở class detail chỉ tạo mới — thêm picker chọn học viên có sẵn để enroll vào lớp đang xem (enrollment + gói + sinh buổi), KPI sĩ số tăng."
status: completed
priority: P1
effort: "6h"
tags: [bugfix, qc, enroll, class-detail]
created: 2026-08-29
issue: 122
branch: fix/122-class-detail-enroll-existing-student-picker
ship: beta
route: bugfix
---

# Issue #122: Class detail picker enroll học viên có sẵn

## Overview

QC P1 (M1): trên class detail, nút **+ Thêm học viên** mở modal **tạo mới** (Họ tên, SĐT, gói, giá) — không có cách nào chọn học viên đã tồn tại trên org để enroll vào lớp đang xem. Hậu quả: giáo viên không thể đưa `QC-CTA-STUDENT` (đã tạo trên `/students`) vào lớp; sĩ số KPI treo ở 0.

Fix theo hướng bugfix route (`/ak:fix --auto`):

1. **Server**: endpoint mới `POST /api/classes/:id/enroll` nhận `{studentId, total, price, mode}` — tạo enrollment + session package `active` gắn enrollment + sinh chuỗi buổi học từ lịch lớp, trong **một** `db.batch` (atomicity giống nhánh class của `POST /students`).
2. **Web**: action kernel mới `enroll-student` + mapping `kernelCommand` + case reducer cục bộ (fixture parity).
3. **UI**: `AddStudentModal` khi có `classId` hiển thị bộ chuyển chế độ **"Học viên có sẵn"** (mặc định khi còn học viên chưa enroll) / **"Tạo học viên mới"**; picker lọc học viên org chưa nằm trong lớp, kèm trường gói (số buổi / đơn giá / hình thức). Trang `/students` (không `classId`) giữ nguyên form tạo mới.

Roster và KPI sĩ số đã derive từ enrollments (`ClassGroup.studentIds` ← `rosterByClass`), nên sau enroll + refresh chúng tự tăng — không cần sửa mapping đọc.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Chọn học viên có sẵn và enroll vào lớp đang xem từ class detail | P1 |
| 2 | Enroll sinh đủ: enrollment + gói active + chuỗi buổi học theo lịch | P1 |
| 3 | Roster tab và KPI sĩ số tăng sau enroll | P1 |
| 4 | Chặn enroll trùng (picker loại + server 409) | P2 |
| 5 | Flow tạo mới từ class detail và modal `/students` không bị hồi quy | P2 |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Phase 1: Contracts + server enroll endpoint](./phase-01-contracts-server-enroll.md) | Pending |
| 2 | [Phase 2: Web action + modal picker](./phase-02-web-action-modal-picker.md) | Pending |
| 3 | [Phase 3: E2E QC repro + hồi quy](./phase-03-e2e-regression.md) | Pending |

## Acceptance Criteria

- [ ] Class detail → + Thêm học viên: khi org còn học viên chưa enroll vào lớp này, modal mở ở chế độ **Học viên có sẵn** với danh sách chọn được (tên + SĐT, có ô lọc).
- [ ] Chọn học viên có sẵn + nhập gói (số buổi, đơn giá, hình thức) + Lưu → enroll thành công: roster tab hiện học viên, KPI sĩ số tăng đúng.
- [ ] Sau enroll, `Buổi học` sinh đủ `sessionsTotal` buổi theo lịch lớp (cùng semantics nhánh `POST /students` có `classId`).
- [ ] Học viên đã enroll trong lớp không xuất hiện lại trong picker; enroll trùng qua API trả 409.
- [ ] Enroll học viên không tồn tại / lớp không tồn tại / khác org → 404.
- [ ] Chế độ "Tạo học viên mới" từ class detail vẫn tạo + enroll như cũ (flow #5, #104 không hồi quy).
- [ ] Modal `/students` (không `classId`) giữ nguyên: chỉ form tạo mới, không toggle.
- [ ] Enroll ghi trong 1 batch: thất bại giữa chừng không để lại enrollment/gói/buổi mồ côi.

## Scope Boundary (không làm trong plan này)

- Không attach/pool gói bị park (`enrollmentId === null` từ #104) vào enrollment mới — đã bị cut theo journal #104; enroll luôn tạo gói mới active.
- Không transfer/chuyển gói giữa các enrollment, không hủy enroll (un-enroll).
- Không sửa semantics sinh buổi hay projected sessions (#121) — enroll tái dùng `generateScheduleLessons` nguyên trạng.
- Không sửa mapping đọc snapshot (roster/KPI đã derive từ enrollments).

## Key Facts (codebase, đã xác minh)

- Server: `apps/server/src/routes/kernel.ts:357` `POST /students` — nhánh `cls` là mẫu cho enroll batch: `enrollment` + `sessionPackage` (start=`formatDayMonth(new Date())`, expiry="", status "active") + lessons từ `generateScheduleLessons({schedule, startDate, sessionsTotal, orgId, classId, enrollmentId})`.
- Unique index `enrollment_class_student_uq` trên `(classId, studentId)` (`packages/db/src/schema/enrollment.ts`) — chặn trùng ở DB; API phải bắt và trả 409 trước để lỗi thân thiện.
- Contracts: `packages/api/src/contracts.ts:9` `studentCreateSchema` — mẫu schema zod cho `enrollStudentSchema`.
- Web mapping: `apps/web/src/lib/repos/kernel.ts:36` `kernelCommand("add-student") → POST /api/students`.
- Reducer fixture: `apps/web/src/lib/data-store-reducer.ts:84` case `add-student` (đã xử lý classId).
- UI: `apps/web/src/components/modals/add-student-modal.tsx` (form tạo mới); host `apps/web/src/routes/_auth/classes/$classId.tsx:152,279` (+ Thêm học viên, KPI `cls.studentIds.length`); host `/students` `apps/web/src/routes/_auth/students/index.tsx:82` (không classId).
- Dữ liệu picker: `useData()` snapshot `students` (toàn bộ org) đã có sẵn ở class detail; loại trừ `cls.studentIds`.
- Tests: server `apps/server/src/kernel.test.ts` (app thật + migrate, tìm enrollment qua `findEnrollment(snapshot, classId, studentId)`); web `apps/web/src/lib/data-store-reducer.test.ts`; e2e `apps/e2e/specs/class-operations.spec.ts` (mẫu scenario M1, helper `signUpViaUi`).

## Risk Assessment

| Risk | Signal | Pre-decided response |
|------|--------|---------------------|
| Default-mode heuristic (picker khi còn học viên chưa enroll) làm e2e `class-operations` hồi quy (org trống → phải rơi về tạo mới) | e2e FAIL ở bước điền "Họ tên học viên *" | Rule mặc định là deterministic theo dữ liệu; nếu vẫn fail, chỉnh spec chuyển tab tường minh — không đổi heuristic cho khớp test |
| 409 từ unique index nổ ra dưới dạng lỗi DB thay vì JSON thân thiện | Test thấy 500/raw error | Bắt check exists trước insert trong cùng batch flow; test khẳng định 409 + message |
| Gói enroll lệch field so với nhánh `POST /students` (lặp lại lỗi #104) | Snapshot gói thiếu start/expiry/status | Reuse đúng bộ `packageValues` field-identical; test assert đủ trường |
| Org isolation: học viên org khác bị enroll | Test cross-org pass nhưng data rò | Endpoint luôn filter theo `ctx.orgId` (giống `findClass`); test cross-org 404 |
