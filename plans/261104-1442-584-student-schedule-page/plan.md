---
title: "feat(student): thêm trang lịch học riêng ở cổng học viên"
description: "Thêm trang lịch học (/schedule) gộp các buổi của mọi lớp học viên đang tham gia, endpoint GET /api/student/schedule, mục menu tương ứng trên student nav theo DESIGN.md."
status: in_progress
priority: P3
effort: 3h
issue: 584
branch: feat/584-student-schedule-page
tags: [student, schedule, nav, contracts, server, routes]
blockedBy: []
blocks: []
created: 2026-11-04
---

# Plan: Thêm trang lịch học riêng ở cổng học viên

## Outcome
Học viên có trang "Lịch học" riêng tại đường dẫn `/schedule` trên cổng học viên (`apps/student`), gộp các buổi học từ tất cả các lớp đang học (enrollment `active`) theo thứ tự thời gian, hỗ trợ lọc buổi Sắp tới / Đã học / Tất cả, lọc theo lớp, hiển thị lịch cố định tuần của các lớp, và có mục điều hướng "Lịch học" (icon `CalendarDays`) trên thanh menu học viên theo `DESIGN.md`.

## Architecture & Data Flow

```mermaid
flowchart TD
    Nav[Menu học viên: Lịch học /schedule] --> Route[/_auth/schedule.tsx]
    Route --> Gate[StudentPageGate: me + orgContext]
    Gate --> Hook[useStudentSchedule]
    Hook --> API[GET /api/student/schedule]
    API --> AuthGuard[requireStudent: studentCtx]
    AuthGuard --> DB[(SQLite: enrollment + class + lesson)]
    DB --> FilterActive[Chỉ lấy enrollment active của student trong orgId]
    FilterActive --> MapLessons[Map lessons theo enrollmentId + classInfo]
    MapLessons --> Resp[StudentScheduleResponse]
    Resp --> View[StudentScheduleView]
    View --> RecurSec[Mục 1: Lịch học định kỳ các lớp]
    View --> FilterTabs[Bộ lọc: Sắp tới / Đã học / Tất cả + Chip chọn lớp]
    View --> TimelineSec[Mục 2: Lưới / Dòng thời gian các buổi học]
```

## Decisions & Scope Lock (Advisor Supervised)

1. **Bảo mật & IDOR Guard:**
   - Lọc bài học qua `enrollment` của chính học viên (`enrollment.studentId = s.id` và `enrollment.orgId = orgId` và `enrollment.status = 'active'`).
   - Lọc `lesson` theo `lesson.enrollmentId = enrollment.id` (KHÔNG join qua `classId` vì sẽ làm lộ buổi và trạng thái điểm danh của học viên khác trong cùng lớp).
   - Enrollment ở trạng thái `invited` (chưa bấm tham gia) không xuất hiện trên trang lịch học.
   - Khi học viên chưa có lớp nào, trả về 200 `{ classes: [], lessons: [] }`, không trả 404.

2. **API Contract & Shape:**
   - Mở rộng từ `studentClassLessonSchema`:
     ```ts
     export const studentScheduleLessonSchema = studentClassLessonSchema.extend({
       classId: z.string(),
       className: z.string(),
     });
     export type StudentScheduleLesson = z.infer<typeof studentScheduleLessonSchema>;
     ```
   - Schema response:
     ```ts
     export const studentScheduleResponseSchema = z.object({
       classes: z.array(studentClassSchema),
       lessons: z.array(studentScheduleLessonSchema),
     });
     export type StudentScheduleResponse = z.infer<typeof studentScheduleResponseSchema>;
     ```
   - Trường `date` là `string | null` (chuỗi `yyyy-mm-dd` hoặc null cho lớp legacy).

3. **Xử lý lớp Legacy (undated sessions):**
   - Các buổi có ngày (`date != null`): sắp xếp toàn cục theo thứ tự thời gian `(date ASC, time ASC, classId ASC, id ASC)`.
   - Các buổi của lớp legacy (`date == null`): sắp xếp theo heuristic `orderStudentLessons`, hiển thị trong nhóm riêng "Lớp chưa gắn ngày cụ thể" hoặc bảng lịch cố định của lớp đó để tránh tạo ngày giả.

4. **Phân loại Sắp tới / Đã học (Upcoming / Ended):**
   - Tái sử dụng logic xác định kết thúc buổi học `vietnamSessionEndMs(date, time, dur)` / `isLessonEnded`:
     - Buổi `upcoming` chưa qua giờ kết thúc và `date >= todayISO`: thuộc tab "Sắp tới".
     - Buổi `completed`, `absent`, hoặc `upcoming` nhưng đã qua giờ kết thúc: thuộc tab "Đã học".
     - Buổi `holiday` (nghỉ lễ đã dời) và `cancelled` (đã hủy) có badge riêng rõ ràng.
   - Nổi bật "Buổi kế tiếp" (Next session) với chỉ báo viền ring nổi bật.

5. **Thiết kế UI & Navigation:**
   - Cập nhật `apps/student/src/components/layout/student-nav.tsx`:
     - Thêm mục `schedule` với nhãn `"Lịch học"`, icon `CalendarDays`, href `"/schedule"`.
     - `ACTIVE_KEY_BY_PREFIX["/schedule"] = "schedule"`.
     - `STUDENT_PAGE_LABEL["schedule"] = "Lịch học"`.
   - Giao diện tuân thủ `DESIGN.md`:
     - Token shadcn neutral oklch, light mode mặc định, hỗ trợ dark mode.
     - Phông chữ Geist Variable, số liệu `tabular-nums` cho ngày giờ.
     - Card `rounded-xl border bg-card shadow-sm`.
     - Empty states trực quan bằng `OverviewEmptyState`: khi chưa có lớp, khi không có buổi sắp tới, hoặc khi bộ lọc rỗng.
     - Link từ mỗi buổi hoặc thẻ lớp tới `/classes/$classId`.

## Phases

| # | Phase | Trạng thái | Ước lượng |
|---|---|---|---|
| 1 | [API Contracts và Backend Endpoint](phase-01-api-contracts-and-endpoint.md) | pending | 45m |
| 2 | [Student Nav và Data Repository](phase-02-student-nav-and-repos.md) | pending | 30m |
| 3 | [Giao diện Trang Lịch học và Tests](phase-03-schedule-page-and-views.md) | pending | 60m |

## Acceptance Criteria

- [ ] `studentScheduleLessonSchema` và `studentScheduleResponseSchema` được xuất từ `@teacher-os/api/contracts`.
- [ ] Endpoint `GET /api/student/schedule` trả về danh sách lớp và toàn bộ buổi học của học viên trong org hiện tại.
- [ ] Bảo mật: IDOR guard chặn triệt để học viên khác hoặc org khác, loại trừ enrollment `invited`, chỉ lấy bài học theo `enrollmentId`.
- [ ] Kiểm thử server trong `apps/server/src/routes/student-schedule.test.ts` kiểm tra đủ 6 trường hợp: 401 khi chưa login, 200 rỗng khi không có lớp, bảo vệ IDOR org/student, loại trừ invited, và sắp xếp theo thời gian.
- [ ] Thanh menu học viên hiển thị mục "Lịch học" với icon `CalendarDays` dẫn đến `/schedule`, active key và breadcrumb label hiển thị đúng "Lịch học".
- [ ] Trang `/schedule` có route `_auth/schedule.tsx` bọc trong `StudentPageGate`, xử lý đầy đủ trạng thái loading/error.
- [ ] Component `StudentScheduleView` hiển thị lịch định kỳ của từng lớp, danh sách buổi học gộp có tabs Sắp tới / Đã học / Tất cả, lọc theo lớp, và empty state khi không có dữ liệu.
- [ ] Toàn bộ test suites pass, `pnpm check` và `pnpm check-types` pass không có lỗi.
