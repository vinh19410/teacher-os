---
phase: 2
title: "Phase 2: Redesign Tab Hành trình học"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Redesign Tab Hành trình học

## Goal
Redesign hoàn chỉnh tab **Hành trình học** (`ClassLessonList` cùng 2 khối `JourneySummitCard` và `JourneyNextStopHero`) theo `open-design/student-classes.html`, sử dụng 100% dữ liệu thật từ `StudentClassDetail` và token design v2, bảo toàn toàn bộ tính năng #998 và các bất biến DOM/E2E đã khóa.

## Files to Create / Modify
- Create: `apps/student/src/components/class/journey-summit-card.tsx`
- Create: `apps/student/src/components/class/journey-next-stop-hero.tsx`
- Modify: `apps/student/src/components/class/class-lesson-list.tsx`
- Modify: `apps/student/src/components/class/class-detail-view.tsx` (truyền `classLevel`, `className`, `assignments`, `filter`, `onFilterChange`, `onOpenAssignment` xuống `ClassLessonList`)
- Modify: `apps/student/src/components/class/class-lesson-list.test.tsx`

## TDD Structure

### Tests Before
Mở rộng `apps/student/src/components/class/class-lesson-list.test.tsx` trước khi sửa component để khóa các hành vi mới và giữ các bất biến cũ:
- Summit card hiển thị `data-testid="journey-syllabus-header"` khi có `syllabus` và dated module grouping (ẩn ở lớp legacy `date: null`), hiển thị `syllabus.name` trong 1 phần tử riêng (không lặp để `getByText(syllabus.name)` exact pass), hiển thị `role="progressbar"` với `aria-valuenow`/`aria-valuemax`, `% hành trình`, số chặng đã vượt nhất quán với `held` (`completed || absent`, loại `__extra__` khỏi `totalModulesCount`), và ETA ngày buổi cuối cùng (ẩn ETA khi legacy).
- Next Stop Hero hiển thị eyebrow `"Buổi tiếp theo"`, chuỗi đếm ngược hoàn chỉnh (`formatSessionCountdown`), nút `"Chuẩn bị bài"`, và `ZoomJoinButton` nhận riêng `nowMs={zoomNowMs}` (không đóng băng `now.getTime()`, KHÔNG `disabled`, kèm gợi ý `"Mở lúc HH:mm (trước 30 phút)"` hoặc `"Mở lúc HH:mm dd/mm (trước 30 phút)"` khi khác ngày); ẩn hoàn toàn khi `isPaused=true`; hiển thị trạng thái hoàn thành khi đã qua hết buổi ở lớp có ngày.
- Bộ lọc `Tất cả | Đã đi qua | Phía trước` (`aria-pressed`) chạy SAU `buildIndexedLessons` và `groupLessonsByModules` (<!-- Updated: Red-Team RT-13 --> không bao giờ đánh lại số buổi `Buổi N` hay tỷ lệ `"X/Y buổi"` của module khi lọc; ẩn module rỗng); khi không khớp buổi nào hiển thị thông báo rỗng và nút quay về `"Tất cả"`.
- Nút `"Vị trí hiện tại"` dùng cơ chế 2 pha (`pendingLocate`, <!-- Updated: Red-Team RT-9 -->): tự bỏ lọc `done` về `all`, mở rộng `nextLesson`, sau khi DOM commit mới gọi `scrollIntoView?.(...)` và `focus()`.
- `nextLesson` mở sẵn mặc định (`aria-expanded="true"`), hiển thị `objectives`, `Xem recording` (`target="_blank" rel="noopener noreferrer"`) + `RecordingPassword` (khi có), CTA `"Mở trang buổi học"` (KHÔNG lặp chuỗi `"N bài giảng"`/`"M bài tập"` và KHÔNG lặp `data-testid="session-link-..."`, <!-- Updated: Red-Team RT-5 -->), và bài tập gắn buổi chỉ khi `Boolean(lesson.date) && lesson.status !== "holiday" && a.sessionDate === lesson.date` (<!-- Updated: Red-Team RT-10 -->) với nút `"Mở trong Bài tập"`.
- Buổi đã học mặc định đóng (`aria-expanded="false"`); bấm mở hiện cảnh báo vắng (với `absent`, màu `--warn`), `Xem recording`, `RecordingPassword`, `Đang chờ recording`, và liên kết chi tiết buổi.
- Bất biến DOM & State: `container.querySelectorAll("li")` ĐÚNG bằng số buổi học (không `milestoneLi`, không `<ul><li>` trong `.stop-detail`); `session-link-${date}` là sibling không lồng trong `<button aria-expanded>`; nhãn badge trên `<li>` giữ đúng `"Buổi tới"` + `aria-current="true"`; `expandedIds` reset khi `classId` đổi; `LESSON_STATUS` export giữ nguyên cho `SessionDetailView` (<!-- Updated: Red-Team RT-14 -->).

### Refactor
Xây dựng `JourneySummitCard`, `JourneyNextStopHero`, và cập nhật `ClassLessonList` với rail 32px (solid đến pivot `next`, dashed về sau), trạng thái `absent` dùng token `--warn` nội bộ trong `ClassLessonList`, node `midterm`/`final` hình thoi/vuông nổi bật, bố cục `min-w-0 flex-wrap` không tràn ngang tại `320px`, không hard-code hex, animation `≤ 220ms` và tôn trọng `prefers-reduced-motion`.

### Tests After
Chạy toàn bộ test Tab 1, `ClassDetailView`, và `SessionDetailView` để xác minh cả hành vi mới lẫn hợp đồng #998/#694/#816/TOS-11.

### Regression Gate
- `pnpm --filter student test -- src/components/class/class-lesson-list.test.tsx src/components/class/class-detail-view.test.tsx src/components/class/session-detail-view.test.tsx test/class-detail.test.tsx`
- `pnpm --filter student exec tsc --noEmit`

## Tasks & Steps

### Task 2.1 — Cập nhật & bổ sung test TDD cho `ClassLessonList` (TDD Red)
- **Goal:** Viết các test case mới cho Summit, Next Stop Hero (`zoomNowMs` không đóng băng), bộ lọc giữ nguyên `Buổi N`, `"Vị trí hiện tại"` 2 pha từ `jf=done`, accordion co/mở buổi học, guard `null === null` & `holiday` cho bài tập gắn buổi, và nút `"Mở trong Bài tập"`; cập nhật assertion cũ trên buổi đã qua (mở accordion trước khi đọc `Xem recording` / `RecordingPassword`) và Zoom button trên `nextLesson` (nằm trong `journey-next-hero`).
- **Target files and symbols:** `apps/student/src/components/class/class-lesson-list.test.tsx`.
- **Steps:**
  1. Giữ nguyên tất cả các describe test cho TOS-11 holiday, lớp tạm dừng (#694), Zoom & Recording (#816), và gộp giáo trình (#998).
  2. Trong suite Zoom & Recording, kiểm tra `ZoomJoinButton` của `nextLesson` ở trong `journey-next-hero` (luôn enabled kể cả trước `openAt`, và giữ nguyên test `"không đóng băng now lúc render"`), kiểm tra `ZoomJoinButton` của buổi `upcoming` khác trong `.stop-detail`; trên các buổi `completed`/`absent`/`ended` trong test recording, bấm mở nút summary của dòng tương ứng rồi kiểm `Xem recording` (`target="_blank" rel="noopener noreferrer"`), `RecordingPassword`, `Đang chờ recording`.
  3. Thêm describe `"ClassLessonList — redesign Hành trình học"` phủ Summit card (gồm trường hợp `completed` + `absent` nhất quán giữa thanh tổng và số chặng, loại `__extra__`), Next Stop Hero (countdown + `Mở lúc` + completion state + hidden when paused), segmented filter giữ nguyên `Buổi N` + empty filter state, `"Vị trí hiện tại"` khi đang lọc `done`, cảnh báo buổi vắng, không lặp chuỗi `"1 bài giảng"`/`"3 bài tập"` khi `nextLesson` mở sẵn, guard legacy `null === null` & `holiday` khi ghép bài tập, và nút `"Mở trong Bài tập"`.
- **Success criteria:** Test mới chạy và fail (red phase) vì UI mới chưa được triển khai.
- **Verify:** `pnpm --filter student test -- src/components/class/class-lesson-list.test.tsx` exits non-zero with assertion failure (passing is a failure).

### Task 2.2 — Tạo `JourneySummitCard` và `JourneyNextStopHero`
- **Goal:** Tách gọn 2 khối đầu tab Hành trình học theo đúng thị giác `open-design/student-classes.html`, dùng 100% token `globals.css` (Light + Dark) và không tràn ngang ở `320px`.
- **Target files and symbols:**
  - `apps/student/src/components/class/journey-summit-card.tsx` (`JourneySummitCard`)
  - `apps/student/src/components/class/journey-next-stop-hero.tsx` (`JourneyNextStopHero`)
- **Steps:**
  1. <!-- Updated: Red-Team RT-13 --> Trong `JourneySummitCard`:
     - Nhận `classLevel`, `className`, `syllabus`, `useModuleGrouping`, `heldCount`, `totalTeachingCount`, `clearedModulesCount`, `totalModulesCount`, `nextTeachingIndex`, `lastDatedISO`.
     - Gắn `data-testid="journey-syllabus-header"` **chỉ khi** `useModuleGrouping && syllabus != null` (giữ hợp đồng `class-lesson-list.test.tsx:616` và `student-session-detail.spec.ts:360`).
     - Render khối icon `Mountain` (`size-12 rounded-lg bg-primary text-primary-foreground`), eyebrow `"Đích đến của bạn"`, tiêu đề mục tiêu (`classLevel?.trim() || syllabus?.name?.trim() || className`), và nếu `syllabus?.name?.trim()` khác tiêu đề mục tiêu thì render `<p>{syllabus.name}</p>` trong 1 phần tử riêng duy nhất (bảo đảm `getByText(syllabus.name)` exact match ở `class-detail.test.tsx:352` luôn pass và không lặp). Hiện `syllabus.description` (nếu có) và ETA `"Về đích dự kiến ${formatVietnamFullDate(lastDatedISO)}"` khi có ngày.
     - Bên phải: chỉ số `clearedModulesCount/totalModulesCount chặng đã vượt` (khi `totalModulesCount > 0`, không tính cụm `__extra__`; 1 chặng được tính đã vượt khi toàn bộ buổi dạy của chặng đó đã diễn ra `completed || absent`, nhất quán 100% với thanh tiến độ `heldCount/totalTeachingCount`) hoặc `heldCount/totalTeachingCount buổi đã diễn ra`.
     - Thanh tiến độ `role="progressbar"` (`aria-valuemin={0}`, `aria-valuemax={totalTeachingCount}`, `aria-valuenow={heldCount}`) với `bg-primary` (hoặc `bg-success` khi đạt 100%) + dòng meta `tabular-nums`: `${pct}% hành trình` + (nếu có `nextTeachingIndex`) ` · Bạn đang ở trước buổi ${nextTeachingIndex}`.
  2. <!-- Updated: Red-Team RT-12 --> Trong `JourneyNextStopHero`:
     - Nhận `classId`, `nextLesson`, `nextTeachingIndex`, `isPaused`, `hasDatedLessons`, `heldCount`, `todayISO`, `now`, `zoomNowMs?: number`, `onLocate: () => void`.
     - Chỉ render khi `!isPaused && (nextLesson != null || (hasDatedLessons && heldCount > 0))`.
     - Khi có `nextLesson`: thẻ `data-testid="journey-next-hero"` viền đậm `border-[1.5px] border-primary bg-card rounded-xl p-4 sm:p-6`, eyebrow `"Buổi tiếp theo"`, tiêu đề buổi, meta `Buổi N · ngày · giờ · thời lượng phút`, dòng đếm ngược với icon `Clock` dùng `formatSessionCountdown` (trả chuỗi hoàn chỉnh, không nối `"Bắt đầu sau "` ở ngoài).
     - Nhóm nút hành động (`flex flex-wrap items-center gap-2`): nút `"Chuẩn bị bài"` gọi `onLocate()`, và khi `showZoomLink` đúng → render `<ZoomJoinButton classId={classId} date={nextLesson.date} time={nextLesson.time} dur={nextLesson.dur} variant="default" size="default" nowMs={zoomNowMs} />` (tuyệt đối truyền `zoomNowMs`, KHÔNG `now.getTime()`, KHÔNG `disabled`!) kèm gợi ý `Mở lúc ${openAtLabel} (trước 30 phút)` tính bằng `formatZoomOpenAtLabel` với `zoomNowMs ?? now.getTime()`.
     - Khi không còn `nextLesson` nhưng `hasDatedLessons && heldCount > 0`: thẻ hoàn thành viền chuẩn `border bg-card` với eyebrow `"Hoàn thành"` và tiêu đề `"Bạn đã đi hết lộ trình — chúc thi tốt!"`.
- **Success criteria:** Component biên dịch sạch, không hard-code hex, hỗ trợ đầy đủ Light & Dark.
- **Verify:** no verification needed (covered by Task 2.3 verification).

### Task 2.3 — Redesign `ClassLessonList` và nối props từ `ClassDetailView`
- **Goal:** Tích hợp Summit, Next Stop Hero, Toolbar lọc + `"Vị trí hiện tại"` 2 pha, và Vertical Journey Rail 32px co/mở vào `ClassLessonList`, bảo toàn 100% hợp đồng #998, `SessionDetailView` và E2E.
- **Target files and symbols:**
  - `apps/student/src/components/class/class-lesson-list.tsx` (`ClassLessonList`, giữ nguyên export `LESSON_STATUS`, `lessonDayLabel`, `isLessonEnded`, `findNextLessonId`)
  - `apps/student/src/components/class/class-detail-view.tsx` (truyền props cho `ClassLessonList`)
- **Steps:**
  1. <!-- Updated: Red-Team RT-14 --> Giữ nguyên hoàn toàn `LESSON_STATUS`, `lessonDayLabel`, `isLessonEnded`, `findNextLessonId` để `SessionDetailView` và `ClassInfoCard` không thay đổi bất ngờ; trong `ClassLessonList`, dùng map chip style nội bộ cho `absent` theo tone `--warn` (`border-warn/30 bg-warn-soft text-warn`) và `completed` theo tone `--success` (`border-success/30 bg-success-soft text-success`) tuân thủ `REVIEW.md:17`.
  2. Thêm props tùy chọn cho `ClassLessonList`: `classLevel?: string`, `className?: string`, `assignments?: StudentAssignment[]`, `filter?: JourneyFilter`, `onFilterChange?: (next: JourneyFilter) => void`, `onOpenAssignment?: (assignmentId: string) => void`.
  3. <!-- Updated: Red-Team RT-7, RT-9 --> Quản lý `expandedIds: Set<string>` khởi tạo với `nextId` (khi `!isPaused && nextId != null`), reset khi `classId` hoặc `nextId` đổi. Quản lý `pendingLocate` (boolean) + `flashedId` (string | null, `220ms`): bấm `"Vị trí hiện tại"` hoặc `"Chuẩn bị bài"` đặt `pendingLocate = true`, nếu `filter === "done"` thì gọi `setFilter("all")`, thêm `nextId` vào `expandedIds`; `useEffect` chờ `pendingLocate && filter !== "done"` và ref `stopBtnRefs.current.get(nextId)` có mặt trong DOM rồi mới gọi `scrollIntoView?.(...)`, `focus({ preventScroll: true })`, bật `flashedId` và reset `pendingLocate = false`.
  4. <!-- Updated: Red-Team RT-11, RT-13 --> Chạy `buildIndexedLessons(lessons)`, `groupLessonsByModules(lessons, syllabus)` và xác định `pivotIndex` (trạng thái `isAheadOfPivot`) trên TOÀN BỘ `lessons` TRƯỚC khi lọc theo `filter` (`done` = `completed|absent|ended|cancelled`; `ahead` = `next|upcoming|paused_upcoming`; `holiday` chỉ hiện ở `all`). Ẩn module có 0 buổi sau lọc, giữ nguyên nhãn `"X/Y buổi"` trên header module.
  5. Render Toolbar `"Lộ trình chinh phục"` (`<p className="font-semibold text-lg tracking-tight">` — giữ `<h2 className="sr-only">Buổi học</h2>` ở `ClassDetailView`), segmented filter `role="group" aria-label="Lọc buổi học"` dùng `inline-flex max-w-full flex-wrap` (`Tất cả`, `Đã đi qua`, `Phía trước`) với `aria-pressed`, và nút `"Vị trí hiện tại"` (khi `nextId != null`).
  6. <!-- Updated: Red-Team RT-5, RT-10, RT-11, RT-12 --> Vẽ rail dọc 32px (solid `border-primary` tới pivot `next`, dashed `border-input` sau pivot; node 32px phân biệt rõ `completed`/`absent`/`next`/`upcoming`/`holiday`/`midterm`/`final`):
     - Mỗi hàng buổi clickable dùng flex non-nested `min-w-0 flex-wrap items-center gap-2` (KHÔNG negative margin `calc(100% + ...)`, không tràn ở `320px`): `<button type="button" aria-expanded={open} aria-controls={detailId} className="min-w-0 flex-1 ...">` (chứa meta `Buổi N · ngày · giờ · phút`, badge `Giữa kỳ`/`Cuối kỳ`, title, `secondarySyllabusTitle`, pill `N bài giảng` / `M bài tập`, badge trạng thái `"Buổi tới"`/`"Đã học"`..., `ChevronDown` xoay 180°) + sibling `<Link to="/classes/$classId/sessions/$date" params={{ classId, date }} data-testid={\`session-link-${date}\`}>Chi tiết</Link>`.
     - Bên trong `<div id={detailId} hidden={!open}>` (KHÔNG dùng `<ul>`/`<li>`):
       - Nếu `absent`: callout `--warn` nhắc xem lại recording và nộp bài.
       - Nếu có `objectives`: khối `"Mục tiêu buổi học"`.
       - Nếu `showZoomLink`: với `nextLesson` hiển thị ghi chú `"Link vào lớp mở trước giờ học 30 phút, ngay trên thẻ “Buổi tiếp theo”."`; với các buổi `upcoming` khác render `<ZoomJoinButton nowMs={zoomNowMs} />`.
       - Nếu có `safeRecordingUrl` hoặc `showPendingRecording`: khối `"Recording"` với `<a href={safeRecordingUrl} target="_blank" rel="noopener noreferrer">` `"Xem recording"` + `<RecordingPassword />` hoặc badge `"Đang chờ recording"`.
       - Nếu buổi clickable có ngày: khối `"Tài liệu buổi học"` với mô tả ngắn KHÔNG lặp chuỗi `"N bài giảng"` / `"M bài tập"` (ví dụ `"Xem đầy đủ tài liệu bài giảng và phiếu bài tập trên trang chi tiết buổi học."`) + `<Link to="/classes/$classId/sessions/$date">` `"Mở trang buổi học"` (KHÔNG gắn `data-testid="session-link-..."`).
       - Bài tập gắn buổi: chỉ ghép khi `Boolean(lesson.date) && lesson.status !== "holiday" && a.sessionDate === lesson.date`; render bằng `<div>` kèm chip trạng thái và nút `"Mở trong Bài tập"` gọi `onOpenAssignment?.(a.id)`.
       - Nếu `upcoming` chưa có nội dung: empty dashed box `"Giáo viên sẽ đăng tài liệu chuẩn bị trước buổi học. Bạn sẽ thấy chúng tại đây."`.
  7. Nối props mới trong `ClassDetailView` và giữ nguyên `<h2 className="sr-only">Buổi học</h2>`.
- **Success criteria:** Toàn bộ test Tab 1, `ClassDetailView`, và `SessionDetailView` pass 100%, tổng số `<li>` đúng bằng số buổi học, typecheck sạch.
- **Verify:** `pnpm --filter student test -- src/components/class/class-lesson-list.test.tsx src/components/class/class-detail-view.test.tsx src/components/class/session-detail-view.test.tsx test/class-detail.test.tsx && pnpm --filter student exec tsc --noEmit` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same failure evidence to the user. Never continue by self-reasoning.
