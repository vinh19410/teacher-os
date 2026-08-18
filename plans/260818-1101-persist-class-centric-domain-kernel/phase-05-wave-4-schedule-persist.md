---
phase: 5
title: "Wave 4 Schedule persist"
status: pending
priority: P1
effort: "2d"
dependencies: [4]
---

# Phase 5: Wave 4 Schedule persist

## Overview

Bảng mới `lesson` với `classId` NOT NULL. Check-in/cancel persist. `remaining` derive. Dashboard "hôm nay" đọc D1.

## Context Links

- `apps/web/src/routes/_auth/schedule.tsx`
- `apps/web/src/components/schedule/lesson-modal.tsx`
- Dashboard check-in: `apps/web/src/routes/_auth/dashboard.tsx:74`
- Check-in counter: `apps/web/src/lib/data-store-reducer.ts:122-136`
- Test lock: `apps/web/src/lib/data-store-reducer.test.ts:30-47` (check-in không tăng `sessionsDone`)
- Invariant 2, 6, 7

## Requirements

- Functional: lesson thuộc class. Check-in/cancel persist. `remaining = package.total - count(completed lessons of enrollment)`.
- Non-functional: không tạo buổi mới (stub). Không đụng tuition/assignments routes.

## Architecture

```
lesson: id, orgId, classId NOT NULL, enrollmentId NOT NULL,
        day, time, dur, type, status, topic, zoom
```

Adapter **phải** điền `Lesson.sid` từ enrollment.studentId — 4 consumer còn đọc `l.sid`: `dashboard.tsx:51`, `lesson-modal.tsx:16`, `classes/$classId.tsx:57-58`, `students/$studentId.tsx:72`. Check-in 1:2 chỉ trừ remaining enrollment đó. Không cột `done` trên package. `sessionsDone` derive theo class.

Dashboard "hôm nay" đổi nguồn `data.lessons` → D1. **Giữ** filter `day === 2` (design-week). Không đổi sang `Date()`.

Xóa test "check-in không tăng sessionsDone" **chỉ khi** thay bằng test derive. Không nới invariant.

Tạo buổi lịch vẫn không có write path — non-goal. Test persist dùng helper insert, **không** mở stub/UI tạo buổi. Runtime từ wave 0: `lessons = []` cho đến khi test/helper insert.

## Related Code Files

- Create: `packages/db/src/schema/lesson.ts` + migrate
- Create/Modify: `apps/server/src/routes/lessons/`, `packages/api` lesson contracts
- Modify: `apps/web/src/lib/repos/lessons.ts`, `schedule.tsx`, `lesson-modal.tsx`, khối điểm danh dashboard
- Do not modify: `tuition.tsx`, `assignments/*`

## Implementation Steps

1. Schema `lesson.classId` NOT NULL + migrate.
2. POST `/api/lessons/:id/check-in`, `/cancel`. Không UPDATE package.
3. Derive remaining + sessionsDone trong API/adapter.
4. Dashboard hôm nay đọc lesson D1, giữ `day === 2`.
5. Thay characterization check-in bằng contract derive.
6. Isolation: lesson org A không lộ org B.

## Todo

- [ ] Bảng lesson + classId NOT NULL
- [ ] Check-in/cancel persist
- [ ] Remaining derive; 0 UPDATE session_package.done
- [ ] Dashboard hôm nay từ D1
- [ ] Test derive thay counter

## Success Criteria

- [ ] Reload giữ trạng thái buổi
- [ ] `lesson.classId` NOT NULL
- [ ] Check-in không ghi counter package
- [ ] Org mới: 0 lesson (không seed l1–l11)
- [ ] Quality gate xanh

## Risk Assessment

Mock `Lesson.sid` (student) vs kernel `classId`. Adapter phải resolve student từ enrollment. Signal: 1:2 class check-in trừ sai HV. Response: check-in gắn lesson↔enrollment, không chỉ `sid`.

Không có UI tạo buổi → lịch org mới trống mãi đến plan khác. Đúng non-goal.

## Security Considerations

Check-in chỉ lesson cùng org + user là teacher của org. Không cho client gửi `done`.
