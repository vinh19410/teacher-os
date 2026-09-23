---
phase: 3
title: "Phase 3: Web — roster status UI, kích hoạt, sĩ số"
status: completed
priority: P1
effort: "4h"
dependencies: [1, 2]
---

# Phase 3: Web — roster status UI, kích hoạt, sĩ số

## Context Links

- [plan.md](./plan.md) · [Phase 2](./phase-02-server-invited-and-accept.md) · [Scout enrollment](./reports/scout-report-enrollment.md)
- Code hiện trạng: `apps/web/src/lib/repos/classes.ts:58`, `data-store-reducer.ts:37,122-123,137-139,145-160`, `components/modals/add-student-modal.tsx:43-48`, `components/modals/add-invoice-modal.tsx:38,62-71`, `components/classes/class-assignments-tab.tsx:62-73`, `routes/_auth/classes/$classId.tsx:112-260`, `lib/tuition-from-kernel.ts:53-66`, `lib/mock-data.ts:157`

## Overview

Phân tách roster thành 2 nhóm theo status (D3): `class.studentIds` chỉ còn chứa học viên **đang học**, thêm `class.invitedStudentIds` (derive client-side tại `repos/classes.ts` — KHÔNG thêm field mới vào snapshot server, red-team #10) cho học viên **đã mời**. Roster hiển thị badge + 2 action cho invited: **"Kích hoạt"** (gọi accept command — D4) và **"Hủy lời mời"** (gọi DELETE — D5). KPI sĩ số chỉ đếm đang học; picker học viên và picker hóa đơn loại invited.

## Key Insights

- Hầu hết consumer của `class.studentIds` (KPI sĩ số `$classId.tsx:223`, join nợ học phí, count ở `classes/index.tsx:114` và `syllabus/$syllabusId.tsx:368`) đọc "roster đang học" — đổi NGHĨA studentIds thành active-only làm chúng tự đúng theo D3. Red-team đã verify: assignment picker (`class-assignments-tab.tsx:62-73`) cũng active-only là hành vi mong muốn (đồng bộ với guard server phase 2).
- Reducer `data-store-reducer.ts` là **historical fixture** (dòng 37: "runtime state lives in DataProvider") nhưng vẫn phải sửa cho đúng parity: HAI action append vào `studentIds` — `add-student` nhánh có classId (122-123) và `enroll-student` (137-139); ngoài ra `enroll-student` bịa `pkg` cho học viên (145-160) — invited không có package nên phải bỏ (red-team #4).
- Picker hóa đơn `add-invoice-modal.tsx:38,62-71` lấy options từ toàn bộ `data.enrollments` không nhãn — invited phải bị lọc (server đã 409 từ phase 2, client lọc để UX không đi vào ngã rẽ chết) (red-team #3).
- Nợ học phí (`tuition-from-kernel.ts`) join invoice↔enrollment — sau guard phase 2, invited không thể có invoice nên nợ tự nhiên = 0; không sửa logic.
- Projection buổi học "Dự kiến" derive từ `lessons.length === 0` — với invited (0 lesson) projection hiện đúng như mong muốn; semantics thay đổi (flip tại accept chứ không phải enroll) được xử lý ở e2e (phase 4), không cần sửa `class-sessions.ts`.

## Requirements

- [ ] Web store class có `invitedStudentIds: string[]` derive ở `repos/classes.ts`; `studentIds` chỉ chứa enrollment `active`
- [ ] Roster tab: badge "Đã mời" (warning) / "Đang học"; invited có nút "Kích hoạt" + "Hủy lời mời" (confirm); không có nút nào trên active
- [ ] KPI sĩ số chỉ đếm active; hiển thị phụ "· N chờ xác nhận" khi có invited
- [ ] Picker "Học viên có sẵn" loại học viên đã có enrollment (active hoặc invited)
- [ ] Picker hóa đơn loại enrollment invited
- [ ] Trang học viên (profile/list) hiển thị chip "Đã mời" nếu enrollment invited
- [ ] Reducer: cả `add-student` (classId) và `enroll-student` append vào `invitedStudentIds`; bỏ pkg fabrication

## Architecture

```
snapshot.enrollments[].status (phase 2)
        │
        ▼ repos/classes.ts (derive client-side)
class.studentIds         = enrollments active
class.invitedStudentIds  = enrollments invited
        │
        ├─▶ KPI sĩ số (studentIds.length)  → tự đúng theo D3
        ├─▶ Roster tab: badge + [Kích hoạt] [Hủy lời mời] cho invited
        ├─▶ Picker học viên: loại union(studentIds, invitedStudentIds)
        ├─▶ Picker hóa đơn: loại enrollments invited
        └─▶ Reducer (fixture-parity): 2 action append invitedStudentIds, bỏ pkg
```

Nhãn hiển thị (text + màu cùng lúc): `invited` → "Đã mời", `active` → "Đang học".

## Related Code Files

- Modify: `apps/web/src/lib/repos/classes.ts` — derive 2 list theo status
- Modify: `apps/web/src/lib/repos/enrollments.ts` — `classesByStudent` trả kèm status cho trang học viên
- Modify: `apps/web/src/lib/data-store-reducer.ts` — 2 action + bỏ pkg fabrication
- Modify: `apps/web/src/lib/mock-data.ts` — type `ClassGroup` (157) + fixtures
- Modify: `apps/web/src/components/modals/add-student-modal.tsx` — picker loại union 2 list
- Modify: `apps/web/src/components/modals/add-invoice-modal.tsx` — picker loại invited
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` — badge, KPI, nút Kích hoạt/Hủy lời mời
- Modify: trang profile/list học viên (consumer của `classesByStudent`) — chip "Đã mời"
- Modify: `apps/web/src/lib/data-actions.ts` + `repos/kernel.ts` — 2 action mới: `activate-enrollment` (POST accept), `delete-enrollment` (DELETE)
- Verify-only: `apps/web/src/lib/tuition-from-kernel.ts`, `components/classes/class-assignments-tab.tsx`

## Implementation Steps

1. `repos/classes.ts`: derive 2 list từ enrollments kèm status; cập nhật type `ClassGroup` trong `mock-data.ts` + fixtures.
2. `data-actions.ts` + `repos/kernel.ts`: thêm action `activate-enrollment` (POST `/api/enrollments/:id/accept`) và `delete-enrollment` (DELETE) theo pattern `postKernelCommand` hiện có.
3. Reducer: `enroll-student` VÀ `add-student` (nhánh classId) append vào `invitedStudentIds`; bỏ khối bịa `pkg` (145-160) — giữ parity với dữ liệu invited thật.
4. Roster tab `$classId.tsx`: badge theo status; row invited có 2 nút: "Kích hoạt" (confirm, gọi activate-enrollment) và "Hủy lời mời" (confirm, gọi delete-enrollment); KPI thêm "· N chờ xác nhận" khi N > 0.
5. Picker học viên: điều kiện lọc "không nằm trong union(studentIds, invitedStudentIds)".
6. Picker hóa đơn: lọc `enrollments` theo `status === "active"`.
7. Trang học viên: chip "Đã mời" cho enrollment invited (tận dụng `classesByStudent`).
8. Cập nhật web tests: `add-student-enroll.contract.test.ts` (cả 2 action reducer), `repos/enrollments.test.ts` (fixtures + derive), thêm case derive 2 list từ snapshot có cả invited lẫn active.

## Todo

- [x] Derive `studentIds` (active) + `invitedStudentIds` ở repos/classes.ts + type/fixtures
- [x] Actions activate-enrollment + delete-enrollment
- [x] Reducer: 2 action → invitedStudentIds, bỏ pkg fabrication
- [x] Roster badge + nút Kích hoạt/Hủy lời mời + KPI "N chờ xác nhận"
- [x] Picker học viên loại union; picker hóa đơn loại invited
- [x] Chip "Đã mời" ở trang học viên
- [x] Web tests cập nhật, xanh

## Success Criteria

- `cd apps/web && pnpm vitest run` (hoặc lệnh test của app) xanh.
- KPI sĩ số không đổi khi mời (cả 2 đường enroll); tăng khi bấm Kích hoạt.
- Picker học viên không hiện ai đã có enrollment; picker hóa đơn không hiện enrollment invited.
- Nút Kích hoạt/Hủy lời mời hoạt động qua command mới, refetch snapshot sau mutation.

## Risk Assessment

- Sót consumer `studentIds` chưa phân loại. Mitigation: red-team đã enumerate 9+ điểm (danh sách trong scout report + Key Insights); bước 1 vẫn grep lại toàn `apps/web` để bắt đuôi.
- Optimistic reducer lệch server tạm thời — chấp nhận, web refetch snapshot sau mutation (pattern hiện có).

## Security Considerations

- Kích hoạt/Hủy là action teacher trong org (server org-scoped) — UI không tự quyết quyền.
- Hủy lời mời có confirm dialog (destructive).
- Badge dùng text + màu (accessibility).

## Next Steps

- Phase 4 chạy e2e toàn bộ luồng (12 spec liên quan) + regression + docs.
