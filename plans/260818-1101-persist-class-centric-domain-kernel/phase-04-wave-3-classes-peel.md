---
phase: 4
title: "Wave 3 Classes peel"
status: pending
priority: P1
effort: "0.5-1d"
dependencies: [1]
# Blocked by Wave 0 only. Not blocked by Wave 1/2. Wave 4/6/7 wait on this.
---

# Phase 4: Wave 3 Classes peel

## Overview

Tháo adapter roster/enroll/assign/notes. Class routes gọi API thẳng. **Không bảng mới. Không đổi contract kernel.** Xong wave này, 3 module kernel không còn đọc seed. Được gộp 1 PR / 3 commit với wave 1–2. Wave 4/6/7 được mở sau phase này.

## Context Links

- Routes: `apps/web/src/routes/_auth/classes/index.tsx`, `$classId.tsx`
- Modals: `add-class-modal.tsx`, `assign-syllabus-modal.tsx`, `add-student-modal.tsx` (`classId`)
- Enroll contract: `apps/web/src/lib/add-student-enroll.contract.test.ts`
- Invariant 4: roster = enrollment

## Requirements

- Functional: add class, enroll HV mới vào lớp đang xem, assign syllabus, notes persist.
- Non-functional: không vá "enroll HV có sẵn". Không sửa cây module/lesson hay student profile.

## Architecture

`repos/classes.ts`. `Class.studentIds` không còn map giả — route có thể đọc enrollments. Giữ field `studentIds` trên type `MockData` cho màn chưa peel. `sessionsDone` vẫn stored trên mock type; chưa derive (chưa có bảng lesson).

Có thể gộp wave 1–3 thành 1 PR / 3 commit nếu 1 người.

## Related Code Files

- Create/Modify: `apps/web/src/lib/repos/classes.ts`
- Modify: `apps/web/src/routes/_auth/classes/*`, `add-class-modal.tsx`, `assign-syllabus-modal.tsx`
- Do not modify: syllabus module/lesson tree, `students/$studentId.tsx`

## Implementation Steps

1. Class list/detail từ D1.
2. Add class POST. Enroll chỉ qua add-student + `classId` (server tạo enrollment). Không gọi `POST .../enrollments` từ client.
3. Assign syllabus + notes qua API.
4. Contract test wiring giữ.
5. Grep: students/syllabus/classes không đọc `seedData`.

## Todo

- [x] Repo classes
- [x] Roster = enrollment
- [x] Assign + notes persist
- [x] 3 module hết seed path

## Success Criteria

- [x] Reload giữ lớp + roster + syllabusId + notes
- [x] Org mới: 0 class
- [x] Không JSON `student_ids` trên class
- [x] Quality gate xanh

## Risk Assessment

`sessionsDone` trên UI class vẫn là số stored/mock cho đến wave 4. Signal: user tưởng check-in tăng progress lớp. Response: giữ characterization; derive ở wave 4, không "sửa thầm" ở đây.

## Security Considerations

Enroll student khác org → 403. Unique `(classId, studentId)` tránh double-enroll.
