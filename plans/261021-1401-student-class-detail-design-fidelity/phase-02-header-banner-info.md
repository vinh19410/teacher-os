---
phase: 2
title: "Header, banner bài tập, thẻ thông tin lớp"
status: completed
effort: "2.5h"
dependencies: [1]
---

# Phase 2: Header, banner, thẻ thông tin

<!-- Updated: Validation & Red Team Session 1 - Handover task decomposition + Red Team fixes -->

## Goal

Đưa phần đầu trang `/classes/$classId` (Back link, Todo Banner, Header + nút Nhắn giáo viên, Thẻ thông tin lớp `ClassInfoCard`, và dải 4 `RingStat`) về đúng cấu trúc và token của design v2 mà không làm vỡ hợp đồng E2E.

## Files

- Create: `apps/student/src/components/class/class-info-card.tsx`
- Modify: `apps/student/src/components/class/class-detail-view.tsx`
- Keep unchanged: `apps/student/src/components/overview/class-card.tsx` (`ClassBadges`, `ClassProgress`)

## Tasks

### Task 2.1 — Tạo `ClassInfoCard` (`apps/student/src/components/class/class-info-card.tsx`)
- **Goal:** Hiển thị thẻ thông tin lớp dạng `<dl>` 2→4 cột kèm footer tổng hợp theo dữ liệu thật của lớp.
- **Target files and symbols:**
  - `apps/student/src/components/class/class-info-card.tsx` (`ClassInfoCard`, `computeCourseMonths`)
- **Steps:**
  1. Tạo `ClassInfoCard` nhận `{ detail: StudentClassDetail; todayISO: string; held: number; totalSessions: number }`.
  2. Render `<section className="mb-6 rounded-xl border bg-card text-card-foreground shadow-sm">` chứa `<dl className="grid grid-cols-2 gap-x-6 gap-y-5 p-6 md:grid-cols-4">`:
     - **Khoá** (`BookOpen`): chỉ render khi `cls.level.trim()` khác rỗng → `{cls.level}`.
     - **Lịch** (`CalendarDays`): chỉ render khi `cls.schedule.trim()` khác rỗng → `{formatSchedule(cls.schedule)}`.
     - **Hình thức** (`MapPin`): chỉ render khi `cls.mode.trim()` khác rỗng → `{cls.mode}`.
     - **Giáo viên** (`UserRound`): luôn render ô này; khi có `cls.teacher`, hiển thị `cls.teacher.name` và (nếu `cls.teacher.email.trim()` khác rỗng) thẻ `<a href={`mailto:${cls.teacher.email.trim()}`} className="block truncate font-normal text-primary text-xs hover:underline">{cls.teacher.email.trim()}</a>` để giữ `getByRole("link", { name: teacherEmail })`; khi `cls.teacher === null`, hiển thị `<span className="font-normal text-muted-foreground text-sm">Chưa có thông tin giáo viên.</span>`.
     - **Số buổi đã học** (`ClipboardCheck`): luôn render `{held}/{totalSessions} buổi` (dùng cùng nguồn `computeRingStats` với Ring #1).
     - **Khai giảng** (`GraduationCap`): chỉ render khi `cls.startDate.trim()` khác rỗng → `{formatVietnamFullDate(cls.startDate)}`.
  3. Tính dữ liệu footer:
     - `nextLesson`: tìm bằng `findNextLessonId(detail.lessons, todayISO)` trên `detail.lessons` (cùng nguồn với Timeline).
     - `months`: chỉ tính khi `cls.startDate` khớp `/^\d{4}-\d{2}-\d{2}$/` và có buổi học có `date` hợp lệ `>= cls.startDate`: `Math.max(1, Math.round((endMs - startMs) / (30.4 * 86_400_000)))`. Nếu không đủ dữ liệu hợp lệ → `null` (tuyệt đối không render `NaN tháng`).
     - `timeLabel`: ưu tiên `nextLesson?.time` hoặc khoảng giờ từ `parseSchedule(cls.schedule)` (`${s.start}–${s.end}`).
     - Chỉ render `<div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t px-6 py-3.5 text-muted-foreground text-sm">` khi có ít nhất 1 trong 3 mục (`months`, `timeLabel`, `nextLesson`). Mục "Buổi tới" format: `Buổi tới: ${lessonDayLabel(nextLesson)}${nextLesson.topic ? ` — ${nextLesson.topic}` : ""}` (không in dấu gạch ngang treo khi `topic` rỗng).
- **Success criteria:** `ClassInfoCard` xử lý an toàn lớp đầy đủ, lớp thiếu giáo viên, và lớp legacy (`date: null`, `startDate: ""`).
- **Verify:** no verification needed (kiểm chứng ở Phase 3 Task 3.5 cùng `ClassDetailView`).

### Task 2.2 — Cập nhật `BackHomeLink`, Todo Banner, Header, Ring và `ClassNotFound` trong `class-detail-view.tsx`
- **Goal:** Thay phần đầu của `ClassDetailView` và `ClassNotFound` sang bố cục và token design v2.
- **Target files and symbols:**
  - `apps/student/src/components/class/class-detail-view.tsx` (`BackHomeLink`, `TodoBanner`, `ClassDetailView`, `ClassNotFound`, `computeRingStats`)
- **Steps:**
  1. **Back link (`BackHomeLink`):** Dùng `Link` trỏ `to="/"` với style nút ghost `buttonVariants({ variant: "ghost", size: "sm" })` + `"-ml-3 mb-2 text-muted-foreground"`, bên trong có `<ArrowLeft aria-hidden="true" className="size-4" />` và `{children}` để accessible name vẫn đúng `"Trang chủ"` (và `"Về trang chủ"` ở `ClassNotFound`). Xoá eyebrow mono `"Lớp học"`.
  2. **Todo Banner:** Lọc các bài `detail.assignments` có `a.source === "class_assignment" && a.submittedAt == null && a.scores == null`, sắp xếp theo `deriveAssignmentStatus(a, todayISO).sortOrder` tăng dần để lấy bài cần làm ưu tiên nhất. Khi danh sách `todo.length > 0`, render `<section aria-label="Việc cần làm" className="mb-6 flex flex-wrap items-center gap-4 rounded-xl bg-primary px-5 py-4 text-primary-foreground shadow-sm">` gồm icon `Pin` trong ô `grid size-10 shrink-0 place-items-center rounded-lg bg-primary-foreground/10`, tiêu đề `"Bạn còn {todo.length} bài chưa làm trong {cls.name}"`, mô tả `"Giáo viên đang chờ bài của bạn. Cùng hoàn thành nhé."`, và `Link` tới `/learn/quizzes/$assignmentId` của `todo[0]` với text `"Làm ngay"` + `<ArrowRight aria-hidden="true" />` (không đặt `aria-label="Làm bài: ..."` trên nút banner để không đụng selector trong bảng bài tập).
  3. **Header:** Render `<div className="mb-4 flex flex-wrap items-end justify-between gap-4">`:
     - Trái: `<h1 className="font-semibold text-2xl tracking-tight md:text-3xl">{cls.name}</h1>` và `<Badge variant="outline"><span aria-hidden="true" className={cn("size-1.5 rounded-full", cls.status === "active" ? "bg-success" : "bg-muted-foreground")} />{cls.status === "active" ? "Đang học" : cls.status === "completed" ? "Đã kết thúc" : cls.status}</Badge>`.
     - Phải: khi `teacher?.email?.trim()` tồn tại, render `<a href={`mailto:${teacher.email.trim()}`} className={buttonVariants({ variant: "outline" })}><MessageSquare aria-hidden="true" className="size-4" />Nhắn giáo viên</a>`.
     - Xoá `ClassBadges`, `ClassProgress`, và card giáo viên rời khỏi `ClassDetailView`.
  4. **Thẻ thông tin & Ring:** Đặt `<ClassInfoCard detail={detail} todayISO={todayISO} held={stats.held} totalSessions={stats.totalSessions} />` ngay dưới header; đổi dải 4 `RingStat` sang `mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4` và đổi icon của Ring "Chuyên cần" từ `UserRound` sang `CircleCheck`. Trong `computeRingStats`, dùng `calculateIeltsBand(a.scores)` khi tính `averageBand`.
  5. **`ClassNotFound`:** Bỏ `rounded-lg` thừa (chỉ giữ `rounded-xl`), đổi tiêu đề sang `font-semibold text-xl text-foreground tracking-tight`.
- **Success criteria:** Header, Todo Banner, `ClassInfoCard`, và 4 vòng Ring khớp cấu trúc design v2; không còn import `ClassBadges`, `ClassProgress`, `TeacherAvatar` trong `class-detail-view.tsx`.
- **Verify:** no verification needed (kiểm chứng sau khi hoàn tất phần tab ở Phase 3 Task 3.5).

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
