---
phase: 3
title: "Wave 2 Syllabus peel"
status: pending
priority: P1
effort: "0.5-1d"
dependencies: [1]
# Blocked by Wave 0 only. Not blocked by Wave 1.
---

# Phase 3: Wave 2 Syllabus peel

## Overview

Tháo adapter trên cây giáo trình. Module/lesson giáo trình ghi D1. **Không bảng mới. Không đổi contract kernel.** Không đụng student profile hay tuition. Được gộp 1 PR / 3 commit với wave 1+3.

## Context Links

- Routes: `apps/web/src/routes/_auth/syllabus/index.tsx`, `$syllabusId.tsx`
- Modals: `add-syllabus-modal.tsx`, `add-module-modal.tsx`, `edit-module-modal.tsx`, `add-lesson-modal.tsx`, `edit-lesson-modal.tsx`
- Invariant 5: `syllabus_lesson` ≠ `lesson` lịch
- `class.syllabusId` FK đã có từ kernel; assign peel ở wave 3

## Requirements

- Functional: CRUD syllabus + module + syllabus_lesson persist. `totalLessons` derive từ số lesson giáo trình (khớp reducer `recomputeTotalLessons`).
- Non-functional: không gộp id với lịch. Không sửa student/tuition routes.

## Architecture

`repos/syllabus.ts` → POST actions đã mount wave 0. Syllabus routes ngừng đọc `data.syllabi` seed. `AssignSyllabusModal` trên syllabus detail có thể vẫn dispatch đến wave 3 — chấp nhận tạm nếu chỉ đổi syllabusId qua API kernel sẵn có.

## Related Code Files

- Create/Modify: `apps/web/src/lib/repos/syllabus.ts`
- Modify: `apps/web/src/routes/_auth/syllabus/*`, syllabus modals
- Do not modify: `students/$studentId.tsx`, `tuition.tsx`, `schedule.tsx`

## Implementation Steps

1. List/detail syllabus từ D1.
2. Add/edit module + syllabus_lesson qua API.
3. Recompute `totalLessons` server-side.
4. Org mới: list rỗng.

## Todo

- [ ] Repo syllabus
- [ ] Routes + 5 modal giáo trình
- [ ] totalLessons derive
- [ ] Không đụng bảng `lesson` lịch (chưa tồn tại)

## Success Criteria

- [ ] Reload giữ cây giáo trình
- [ ] 0 đọc seed cho module syllabus
- [ ] Characterization reducer syllabus vẫn dùng fixture
- [ ] Quality gate xanh

## Risk Assessment

`add-lesson` trên syllabus dễ nhầm với lịch. Signal: ai đó tạo bảng `lesson` sớm. Response: dừng, không merge; lịch là wave 4.

## Security Considerations

Mọi write syllabus kiểm tra `syllabus.orgId`. Nested module/lesson không vượt syllabus khác org.
