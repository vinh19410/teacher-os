---
phase: 3
title: "Timeline buổi học, bảng bài tập, giáo trình, bạn cùng lớp"
status: completed
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: Nội dung các tab

<!-- Updated: Validation & Red Team Session 1 - Handover task decomposition + Red Team fixes -->

## Goal

Đưa 4 tab (`Hành trình học`, `Bài tập`, `Giáo trình`, `Bạn cùng lớp`) và thanh `Tabs` trong `/classes/$classId` về đúng design v2, bảo toàn toàn bộ hook unit test và E2E.

## Files

- Modify: `apps/student/src/components/class/class-lesson-list.tsx`
- Create: `apps/student/src/components/class/class-assignment-table.tsx`
- Modify: `apps/student/src/components/class/classmates-tab.tsx`
- Modify: `apps/student/src/components/class/class-detail-view.tsx`
- Modify: `apps/student/test/class-detail.test.tsx`

## Tasks

### Task 3.1 — Chuyển `ClassLessonList` sang Timeline v2 (`apps/student/src/components/class/class-lesson-list.tsx`)
- **Goal:** Hiển thị danh sách buổi học dạng timeline dọc có icon tròn 32px, highlight buổi tới, làm mờ buổi tương lai sau buổi tới, giữ nguyên `findNextLessonId` và `lessonDayLabel`.
- **Target files and symbols:**
  - `apps/student/src/components/class/class-lesson-list.tsx` (`ClassLessonList`, `findNextLessonId`, `lessonDayLabel`)
- **Steps:**
  1. Giữ nguyên `export function lessonDayLabel` và `export function findNextLessonId`, cùng empty state `OverviewEmptyState` khi `lessons.length === 0`.
  2. Khi có buổi học, render `<div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm"><ol className="relative">`:
     - Với mỗi `lesson` ở vị trí `i`:
       - `isNext = lesson.id === nextId`
       - `future = nextId !== null && lesson.status === "upcoming" && !isNext && lesson.date != null && lesson.date > todayISO` (không làm mờ buổi quá khứ chưa điểm danh hoặc lớp legacy `date: null`).
       - Icon chấm tròn 32px (`size-8 rounded-full border`):
         - `completed`: `Check`, `"border-primary bg-primary text-primary-foreground"`
         - `absent`: `X`, `"border-destructive bg-destructive text-white"`
         - `cancelled`: `X`, `"bg-muted text-muted-foreground"`
         - `upcoming` (và mặc định): `CircleDashed`, `"bg-background text-muted-foreground"`, nếu `isNext` thêm `"ring-[3px] ring-ring/30 text-foreground"`
       - Đường dọc nối giữa các buổi (`i < lessons.length - 1`): `<span aria-hidden="true" className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-border" />`.
       - Nội dung buổi học (`div` cột 2): nếu `isNext` thêm `"rounded-lg border bg-muted/40 -mt-1 p-3"`.
         - Dòng phụ: `<div className="text-muted-foreground text-xs tabular-nums">Buổi {i + 1} · {lessonDayLabel(lesson)} · {lesson.time} · {lesson.dur} phút</div>`.
         - Dòng chính: `{lesson.topic && <div className={cn("font-medium", lesson.status === "cancelled" && "text-muted-foreground line-through")}>{lesson.topic}</div>}`.
       - Cột phải (badges):
         - Khi `isNext`: render `<Badge variant="default">Buổi tới</Badge>`.
         - Luôn render `<Badge variant={lesson.status === "absent" ? "destructive" : lesson.status === "upcoming" ? "secondary" : "outline"} className={cn(lesson.status === "cancelled" && "text-muted-foreground line-through")}>{statusLabel}</Badge>` với nhãn tiếng Việt `"Đã học" | "Vắng" | "Sắp tới" | "Đã huỷ"`.
       - Đặt `aria-current={isNext ? "true" : undefined}` trên `<li>`.
- **Success criteria:** Timeline hiển thị đúng đường dọc, chấm trạng thái, thẻ `Buổi tới`, và giữ đủ các chuỗi `"Buổi N"`, `"90 phút"`, `"Đã học"`, `"Vắng"`, `"Sắp tới"`, `"Đã huỷ"`, `aria-current="true"`.
- **Verify:** no verification needed (kiểm chứng ở Task 3.5).

### Task 3.2 — Tạo `ClassAssignmentTable` (`apps/student/src/components/class/class-assignment-table.tsx`)
- **Goal:** Hiển thị danh sách bài tập của lớp dạng bảng (`Table` v2) với cột Bài tập, Hạn, Trạng thái, và nút hành động.
- **Target files and symbols:**
  - `apps/student/src/components/class/class-assignment-table.tsx` (`ClassAssignmentTable`)
- **Steps:**
  1. Nhận `{ assignments: StudentAssignment[]; todayISO?: string }`. Khi `assignments.length === 0`, render `<OverviewEmptyState icon="book" title="Chưa có bài tập nào" description="Giáo viên chưa giao bài tập nào cho bạn." />`.
  2. Sắp xếp bản sao `assignments` theo `deriveAssignmentStatus(a, todayISO).sortOrder` tăng dần.
  3. Render `<div className="no-scrollbar relative w-full overflow-x-auto rounded-md border bg-card"><table className="w-full caption-bottom text-sm">`:
     - `<thead>` có 4 cột `Bài tập`, `Hạn`, `Trạng thái`, và `<th className="h-10 px-3 text-right align-middle font-medium whitespace-nowrap text-muted-foreground"><span className="sr-only">Hành động</span></th>`.
     - Mỗi hàng `<tr>`:
       - Cột 1 (`font-medium`): `{assignment.title}`
       - Cột 2 (`tabular-nums text-muted-foreground`): `derived.dueText.replace(/^Hạn:\s*/, "") || "—"`
       - Cột 3: nếu `derived.status === "graded"` render `<span className="font-medium tabular-nums">{derived.statusLabel}</span>`; nếu `derived.status === "submitted"` render `<Badge variant="secondary">{derived.statusLabel}</Badge>`; nếu `derived.status === "overdue"` render `<Badge variant="destructive">{derived.statusLabel}</Badge>`; ngược lại (`due-soon` / `not-submitted`) render `<Badge variant="default">{derived.statusLabel}</Badge>`.
       - Cột 4 (`text-right`): nếu `assignment.source === "class_assignment"`, render `<Link to="/learn/quizzes/$assignmentId" params={{ assignmentId: assignment.id }} aria-label={assignment.submittedAt ? `Xem lại kết quả: ${assignment.title}` : `Làm bài: ${assignment.title}`} className={buttonVariants({ variant: assignment.submittedAt ? "outline" : "default", size: "sm" })}>{assignment.submittedAt ? (derived.status === "graded" ? "Nhận xét" : "Xem lại") : "Làm ngay"}</Link>`. Cập nhật `apps/e2e/specs/student-practice.spec.ts:170-178` lọc theo `body.getByRole("row").filter({ has: page.getByRole("link", ...) })`.
- **Success criteria:** Bảng bài tập cuộn ngang được ở mobile, giữ `aria-label` `"Làm bài: ..."` / `"Xem lại kết quả: ..."`, và tương thích hoàn toàn với `student-class-detail.spec.ts` + `student-practice.spec.ts`.
- **Verify:** no verification needed (kiểm chứng ở Task 3.5).

### Task 3.3 — Cập nhật `SyllabusTab`, `ClassmatesTab`, và thanh `Tabs`
- **Goal:** Đổi `SyllabusTab` sang icon `Check`/`CircleDashed`, `ClassmatesTab` sang `AvatarInitials`, và thanh tab sang `Tabs` v2.
- **Target files and symbols:**
  - `apps/student/src/components/class/class-detail-view.tsx` (`SyllabusTab`, `ClassDetailView`)
  - `apps/student/src/components/class/classmates-tab.tsx` (`ClassmatesTab`)
- **Steps:**
  1. Trong `SyllabusTab` (`class-detail-view.tsx`): thay ô vuông số thứ tự `{i + 1}` bằng:
     - khi `done`: `<span aria-hidden="true" className="grid size-5 flex-none place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" /></span>`
     - khi chưa `done`: `<CircleDashed aria-hidden="true" className="size-5 flex-none text-muted-foreground" />`
     Giữ nguyên `{topic}` và `<span className="text-muted-foreground text-sm tabular-nums">{progress.completed}/{progress.total} buổi</span>`.
  2. Trong `ClassmatesTab` (`classmates-tab.tsx`): thay `<span>` vuông `size-11` bằng `<AvatarInitials initials={mate.initials} />`; đổi tên sang `<p className="truncate font-medium text-foreground text-sm">{mate.name}{mate.isMe && <span className="ml-1.5 font-normal text-muted-foreground">(bạn)</span>}</p>`. Giữ nguyên `data-testid="classmate-card"` và `data-testid="classmates-grid"`.
  3. Trong `ClassDetailView` (`class-detail-view.tsx`):
     - Thay `div[role="tablist"]` thủ công bằng `<Tabs tabs={CLASS_TABS} active={tab} onChange={(id) => setTab(id as ClassTabId)} ariaLabel="Mục của lớp học" testIdPrefix="class-tab" />`.
     - Ở `tab === "journey"`: giữ `<section><h2 className="sr-only">Buổi học</h2><ClassLessonList lessons={detail.lessons} todayISO={todayISO} /></section>` (giữ heading `"Buổi học"` cho locator E2E `student-class-detail.spec.ts:148`).
     - Ở `tab === "assignments"`: thay `<AssignmentList ... />` bằng `<ClassAssignmentTable assignments={detail.assignments} todayISO={todayISO} />` và bỏ import `AssignmentList`.
- **Success criteria:** Cả 4 tab render đúng primitive design v2, không còn class xung đột.
- **Verify:** no verification needed (kiểm chứng ở Task 3.5).

### Task 3.4 — Cập nhật `apps/student/test/class-detail.test.tsx` và chạy unit test
- **Goal:** Cập nhật và mở rộng unit test `class-detail.test.tsx` khớp với DOM design v2 mà không giảm số lượng assertion.
- **Target files and symbols:**
  - `apps/student/test/class-detail.test.tsx`
- **Steps:**
  1. Giữ nguyên tất cả các test của `ClassLessonList` và `ClassNotFound`.
  2. Trong `describe("ClassDetailView")`:
     - Kiểm tra Header (`<h1`, `"IELTS Detail"`, `"Đang học"`, nút `"Nhắn giáo viên"`), Todo Banner (`"Bạn còn 1 bài chưa làm trong IELTS Detail"`, `"Làm ngay"`), `ClassInfoCard` (`"Band 6.5"`, `"Khai giảng"`, `"Chủ Nhật, 01/03/2099"`, `"Số buổi đã học"`, `"2/5 buổi"`, `"Cô Lan"`, `'href="mailto:lan@example.com"'`), Ring (`"Chuyên cần"`, `"Band trung bình"`), 4 nhãn tab, link `"Trang chủ"`, và `expect(html).not.toContain("Reading Practice 1")` ở tab mặc định.
     - Thêm test kiểm tra khi tất cả bài tập đã nộp thì Todo Banner ẩn đi và `"IELTS Detail"` chỉ xuất hiện đúng 1 lần (ở `<h1>`).
     - Giữ nguyên test chuyển sang tab `"Bài tập"` (`getByRole("link", { name: "Làm bài: Reading Practice 1" })`) và test `teacher: null` (`"Chưa có thông tin giáo viên."`, không có `mailto:`).
  3. Chạy `pnpm --filter student test`.
- **Success criteria:** Toàn bộ test suite của `apps/student` pass 100%.
- **Verify:** `pnpm --filter student test` exits 0 and prints `passed`.

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
