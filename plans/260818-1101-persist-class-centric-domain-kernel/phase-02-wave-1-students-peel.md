---
phase: 2
title: "Wave 1 Students peel"
status: completed
priority: P1
effort: "0.5-1d"
dependencies: [1]
# Blocked by Wave 0 only. Does not block Wave 2/3.
---

# Phase 2: Wave 1 Students peel

## Overview

Tháo adapter trên route học viên. List/detail/`AddStudentModal` gọi repo/API thẳng. **Không bảng mới. Không đổi contract kernel.** Không đụng classes, syllabus, schedule. Được gộp 1 PR / 3 commit với wave 2–3.

## Context Links

- Routes: `apps/web/src/routes/_auth/students/index.tsx`, `$studentId.tsx`
- Modal: `apps/web/src/components/modals/add-student-modal.tsx`
- Contract enroll: `apps/web/src/lib/add-student-enroll.contract.test.ts` — **giữ wiring `classId`**
- Kernel student API đã có từ wave 0

## Requirements

- Functional: `/students` đọc/ghi D1. Add student không class = person only. Add từ class detail vẫn enroll (wave 3 mới tháo class route).
- Non-functional: không đổi visual. Không sửa syllabus/schedule.

## Architecture

`repos/students.ts` cho **đọc** list/detail. **Không** đổi write path `AddStudentModal` — command bus wave 0 + `type: "add-student"` + `payload.classId` phải còn (contract `add-student-enroll.contract.test.ts:34-73`). Class detail vẫn `useData()` đến wave 3. Cấm dual-write POST+dispatch. Gộp 1+3 một PR nếu muốn modal POST.

## Related Code Files

- Create: `apps/web/src/lib/repos/students.ts` (nếu chưa tách từ kernel)
- Modify: `apps/web/src/routes/_auth/students/*` (đọc)
- Do not modify write: `add-student-modal.tsx`
- Do not modify: `classes/*`, `syllabus/*`, `schedule.tsx`

## Implementation Steps

1. Students list/detail fetch kernel students (org-scoped).
2. Không đổi `AddStudentModal` write (giữ dispatch + `classId` trong payload).
3. Contract enroll JSX vẫn xanh.
4. Empty org → empty list (không seed `s1`).

## Todo

- [x] Repo students
- [x] Routes đọc repo; modal write giữ command bus W0
- [x] Contract enroll xanh
- [x] Org mới: list rỗng

## Success Criteria

- [x] Không đọc seed cho module students
- [x] Reload giữ HV vừa tạo
- [x] `/students` không classId; class detail vẫn truyền `classId` (chưa peel class)
- [x] Quality gate xanh

## Risk Assessment

Student detail còn đọc `student.pkg` từ adapter. Package thật chỉ có khi enrollment tồn tại. Signal: detail hiện remaining 0 sau reload — đúng. Đừng nhét lại cột pkg.

## Security Considerations

GET student by id 404/403 nếu khác org. Không tin `studentId` trên URL ngoài org.
