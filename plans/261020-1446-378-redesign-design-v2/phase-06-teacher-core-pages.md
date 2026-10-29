---
phase: 6
title: "Giáo viên: dashboard, lớp, học viên, lịch, giáo trình, hồ sơ, báo cáo"
status: completed
priority: P1
effort: "8h"
dependencies: [4]
---

# Phase 6: Trang giáo viên lõi

## Goal

Khoác bố cục v2 (`design-v2/src/pages/Teacher.tsx` + `TeacherClass.tsx`) cho các màn lõi của
`apps/web`, giữ dữ liệu/hành vi/route hiện có; mỗi màn PASS checklist ảnh.

## Files to Create / Modify

| Màn (screen id) | Route | File chính | Design tham chiếu |
|---|---|---|---|
| t-dashboard | `_auth/dashboard.tsx` | `lib/dashboard-from-kernel.ts` (chỉ đọc) | `Dashboard()`: PageHead + stat row 4 cột + lưới hôm nay/cần chú ý + MorningSpot |
| t-classes | `_auth/classes/index.tsx` | `modals/add-class-modal.tsx` | `Classes()`: lưới card lớp, progress bar, badge lịch |
| t-class-detail | `_auth/classes/$classId.tsx` | `class-detail/*`, `classes/class-assignments-tab.tsx` | `ClassDetail()`: stat row + Tabs "Buổi học & luyện tập / Học viên / Giáo trình", `Section` có đếm |
| t-attendance | modal | `class-detail/session-attendance-modal.tsx` | `AttendanceDialog`: radiogroup có mặt/vắng/muộn, nút lưu disabled tới khi đủ |
| t-students | `_auth/students/index.tsx` | `students/pending-invitations-list.tsx`, `modals/invite-student-modal.tsx`, `enroll-student-modal.tsx` | `Students()`: bảng + TuitionBadge + filter chip |
| t-student-detail | `_auth/students/$studentId.tsx` | `tuition/student-tuition-summary.tsx` | `StudentDetail()`: header avatar + Tabs "Học phí / Bài tập", stat 3 cột |
| t-schedule | `_auth/schedule.tsx` | `schedule/*`, `modals/add-lesson-modal.tsx`, `edit-lesson-modal.tsx` | `Schedule()`: lưới tuần, block buổi, modal buổi |
| t-syllabus | `_auth/syllabus/index.tsx`, `$syllabusId.tsx` | `syllabus/*`, `modals/*syllabus*`, `*module*` | `Syllabus()` + `SyllabusTree()` |
| t-profile | `_auth/profile.tsx` | `profile/*`, `payments/bank-link-panel.tsx`, `modals/bank-hub-link-modal.tsx` | `Profile()` |
| t-reports | `_auth/reports.tsx` | `modals/create-report-modal.tsx` | *(không có)* — pattern Dashboard (Stat + Card + Table) |

## Tasks & Steps

1. Với từng màn: chụp `--label new` trước khi sửa (xem lệch), đổi bố cục sang khối v2 dùng
   primitive phase 3, giữ `data-testid`, accessible name, `aria-*`.
2. Lịch: giữ class móc `lesson-block` và `opacity-60` cho buổi hủy/đã qua (e2e
   `schedule-session-modal`, `projected-sessions`, `class-operations`); nếu đổi sang
   `data-state` thì sửa spec cùng commit.
3. Class detail: thay selector e2e `div.overflow-hidden` (`class-sessions-manage-modal`) và
   `div.mt-8` (`class-roster-tuition-debt`) sang `getByRole('region', { name })`/testid cùng commit.
4. Student detail: `.grid.grid-cols-3 > div` (`student-tuition-summary`) → testid; cập nhật unit
   test `student-tuition-summary.test.tsx`.
5. Recharts (nếu có ở dashboard/reports): màu qua `var(--chart-1)`, `var(--chart-2)`.
6. Mỗi màn PASS → cập nhật `screenshots/verdict.md`.

## Verification

- `pnpm --filter web test -- dashboard classes students schedule syllabus profile reports`
- e2e liên quan (port override): `class-*`, `schedule-*`, `projected-sessions`,
  `student-tuition-summary`, `syllabus-*`, `profile-*`, `reports-*`.
- `pnpm design:compare --screens t-dashboard,t-classes,t-class-detail,t-attendance,t-students,t-student-detail,t-schedule,t-syllabus,t-profile,t-reports --side app --label new`
  → tất cả PASS trong `verdict.md`.
