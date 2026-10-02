---
phase: 2
title: "UI học viên: card giáo viên + link, trang chi tiết lớp"
status: completed
priority: P2
effort: "3.5h"
dependencies: [1]
---

# Phase 2: UI học viên

## Goal
- Card lớp hiển thị avatar, tên và email giáo viên.
- Card lớp đã tham gia là link tới `/classes/$classId`.
- Trang chi tiết lớp hiển thị header lớp, giáo viên, buổi học và bài tập.

## Bối cảnh
- Card: `apps/student/src/components/overview/class-card.tsx`. Card invited có nút "Tham gia lớp", còn card active chỉ có text và progress.
- Trang chủ: `apps/student/src/routes/_auth/index.tsx` (pattern loading/error, `StudentShell`).
- Repo: `apps/student/src/lib/repos/student.ts`. Có các helper `getApiBaseUrl`, `getStudentHeaders`, và pattern fetch → `HttpError` → `schema.parse`. Query key dạng `["student", …]`.
- Avatar fallback: style chữ cái đầu trong `apps/student/src/components/layout/avatar-menu.tsx` (`bg-accent-blue … rounded-full`).
- Bài tập: `AssignmentList` / `AssignmentRow` (`apps/student/src/components/overview/`). `AssignmentRow` luôn in `className`.
- Ngày: `formatVietnamDateFromISO` (`apps/student/src/lib/vietnam-display-date.ts`).
- Sidebar: `apps/student/src/components/layout/student-shell.tsx:76-79`. "Trang chủ" đang là `div` tĩnh.
- Test student: `apps/student/test/overview.test.tsx` (có test `ClassCard`), dùng vitest + Testing Library.

## Files to Create / Modify
- Create: `apps/student/src/components/class/teacher-avatar.tsx`
- Create: `apps/student/src/components/class/class-lesson-list.tsx`
- Create: `apps/student/src/routes/_auth/classes/$classId.tsx`
- Modify: `apps/student/src/components/overview/class-card.tsx`
- Modify: `apps/student/src/components/overview/assignment-list.tsx`, `assignment-row.tsx` (prop `showClassName`)
- Modify: `apps/student/src/components/layout/student-shell.tsx`
- Modify: `apps/student/src/lib/repos/student.ts`
- Generated: `apps/student/src/routeTree.gen.ts` (do plugin router sinh ra, không sửa tay)
- Modify: `apps/student/test/overview.test.tsx`
- Create: `apps/student/test/class-detail.test.tsx`

## Tasks & Steps

### 2.1 Repo
- [x] `fetchStudentClassDetail(classId)`:
  - Gọi `GET ${getApiBaseUrl()}/api/student/classes/${encodeURIComponent(classId)}` với `getStudentHeaders()` và `credentials: "include"`.
  - Khi lỗi, ném `HttpError` theo đúng pattern `fetchStudentOverview`.
  - Thành công thì trả `studentClassDetailSchema.parse(data)`.
- [x] `useStudentClassDetail(classId)`: `useQuery({ queryKey: ["student", "class", classId], queryFn })`. `query-client.ts:46` đã đặt `retry: false` nên 404 hiện ngay, không cần cấu hình thêm.

### 2.2 `TeacherAvatar`
- [x] Props: `{ teacher: StudentTeacher; size?: "sm" | "md" }`. `sm` = 28px dùng cho card, `md` = 44px dùng cho trang chi tiết.
- [x] Có `teacher.image` và chưa lỗi thì render `<img src alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="rounded-full object-cover">`. Ngược lại render span chữ cái đầu của `name` (fallback "G"), style như `AvatarMenu`. `alt=""` vì tên đã hiện ngay cạnh avatar.

### 2.3 `ClassCard`
- [x] Khi `cls.teacher` khác null, thêm một dòng giáo viên **ngay dưới dòng lịch**, trong khối trên:
  - `TeacherAvatar size="sm"`.
  - Cột text: tên (`text-[13px] font-[590] text-fg`, có nhãn trước "GV" hoặc tiền tố "Giáo viên:") và email (`text-[12px] text-muted-fg`).
  - Cả tên và email đều `truncate` (`min-w-0`) để email dài không làm vỡ grid 3 cột.
- [x] Tách nội dung card thành biến `content`:
  - **invited:** giữ wrapper `div` hiện tại, không đổi.
  - **active:** `<Link to="/classes/$classId" params={{ classId: cls.id }} className={<class cũ> + " block focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"}>`. Thêm `aria-label={\`Xem chi tiết lớp ${cls.name}\`}` thì screen reader không đọc toàn bộ card.
  - Email trên card là text thường, không dùng `mailto:`, để tránh lồng link trong link.

### 2.4 `AssignmentList` / `AssignmentRow`
- [x] Thêm prop `showClassName?: boolean` (mặc định `true`) cho `AssignmentRow`. `AssignmentList` nhận prop này và truyền xuống. Trang chủ giữ hành vi cũ.

### 2.5 `ClassLessonList`
- [x] Props: `{ lessons: StudentClassLesson[]; todayISO: string }`.
- [x] Empty state "Giáo viên chưa xếp lịch buổi học cho lớp này." dùng `OverviewEmptyState` (icon `calendar`).
- [x] Mỗi dòng (`<ol>`/`<li>`) gồm:
  - "Buổi {i+1}".
  - Ngày: `formatVietnamDateFromISO(date)`. Khi `date` null thì hiện thứ từ `day` (1–6 thành "Thứ Hai"…"Thứ Bảy", 0 hoặc 7 thành "Chủ nhật").
  - `time`, thời lượng `{dur} phút`, và `topic` nếu có.
  - Badge trạng thái: `completed` = "Đã học" (success), `upcoming` = "Sắp tới" (accent), `absent` = "Vắng" (warn), `cancelled` = "Đã huỷ" (muted). Status khác thì in nguyên chuỗi. Dùng các token màu sẵn có (`bg-accent-soft`, `bg-warn-soft`, …), tham khảo badge trong `class-card.tsx` và `assignment-status.ts`.
- [x] Buổi tới là phần tử đầu tiên có `status === "upcoming"`, `date != null` và `date >= todayISO`. Dòng này có viền `border-accent-blue` và nhãn "Buổi tới". Student app chưa có `vietnamTodayISO` (`vietnam-display-date.ts` chỉ có `formatVietnamToday` / `formatVietnamDateFromISO`). Thêm `vietnamTodayISO(now = new Date())` vào file này, mirror `apps/e2e/specs/helpers.ts:178`, kèm unit test.

### 2.6 Route `/_auth/classes/$classId`
- [x] `createFileRoute("/_auth/classes/$classId")`. Component dùng `useStudentMe()` cho shell và `useStudentClassDetail(classId)`.
- [x] Các trạng thái:
  - Loading: `<Loader />`.
  - 404: trong `StudentShell`, hiện "Không tìm thấy lớp" kèm câu "Lớp này không tồn tại, bạn chưa tham gia, hoặc thuộc tổ chức khác." và `Link to="/"` "Về trang chủ".
  - Lỗi khác: `StudentErrorView` giống trang chủ.
  - `me` chưa onboarding: `<Navigate to="/onboarding" />` như trang chủ.
- [x] Bố cục trong `StudentShell`:
  1. `Link to="/"` "← Trang chủ" (`text-[13px] text-muted-fg hover:text-fg`).
  2. Header: badge level/mode (cùng style card), `h1` tên lớp (`font-display text-[28px]`), lịch (`formatSchedule`), "Khai giảng: …" khi `startDate` khác rỗng, và thanh tiến độ "Buổi x/y" (copy markup từ card).
  3. Grid `lg:grid-cols-[1fr_320px]`:
     - Cột trái: section "Buổi học" (`ClassLessonList`), rồi `AssignmentList assignments={detail.assignments} showClassName={false}`.
     - Cột phải: card "Giáo viên" gồm `TeacherAvatar size="md"`, tên và `<a href={\`mailto:${email}\`}>`. Khi `teacher` null thì hiện "Chưa có thông tin giáo viên."

     Mobile xếp một cột, card giáo viên lên trước.
- [x] Chạy dev hoặc `pnpm --filter student build` để plugin sinh lại `routeTree.gen.ts`, rồi commit file sinh ra.

### 2.7 Sidebar
- [x] `student-shell.tsx`: đổi `div` "Trang chủ" thành `<Link to="/">`, giữ nguyên class hiện tại và thêm focus ring. Luôn giữ style active vì cả trang chủ và trang lớp đều thuộc "Trang chủ". Không thêm logic active theo path.

### 2.8 Test (vitest)
- [x] `overview.test.tsx`, nhóm `ClassCard`:
  - Có teacher thì hiện tên, email, và `img` có `src` đúng. Ảnh lỗi (`fireEvent.error`) thì chuyển sang chữ cái đầu.
  - `teacher: null` thì không render dòng giáo viên.
  - Card active render `role="link"` với `href` là `/classes/<id>`.
  - Card invited không có link, nút "Tham gia lớp" vẫn gọi `onAccept`.
  - File test đã `vi.mock("@tanstack/react-router")` (`overview.test.tsx:17`). Mở rộng mock `Link` để render `<a href>` từ `to` + `params` (nếu mock hiện tại chưa làm vậy), rồi assert `href`.
- [x] `class-detail.test.tsx`:
  - `ClassLessonList`: label trạng thái đúng, highlight "Buổi tới" đúng phần tử, lớp legacy (`date` null) hiện thứ thay ngày, có empty state.
  - Route page với `fetch` mock (theo pattern mock fetch của test student sẵn có):
    - Data hợp lệ thì hiện tên lớp, tên giáo viên, link `mailto:`, danh sách buổi, bài tập không kèm tên lớp.
    - 404 thì hiện "Không tìm thấy lớp" và link về trang chủ.

## Validation
- `pnpm --filter student test`.
- `pnpm check`, `pnpm check-types`.
- Kiểm tra thủ công trên dev stack (port 8003). Ở trang chủ: card có giáo viên, hover/focus đúng, bấm vào mở trang chi tiết. Ở trang chi tiết: đủ 4 phần, kiểm tra ở viewport 375px và desktop. Bấm "Trang chủ" trên sidebar quay về được.

## Risks / Rollback
- Bọc card bằng `Link` đổi DOM từ `div` sang `a`. Test và e2e đang tìm card bằng text thì vẫn chạy. Grep `class-card` / `"IELTS` trong `apps/e2e/specs` để chắc không có selector `div` nào bị vỡ.
- Rollback: revert commit UI. Phase 1 vẫn tương thích vì client cũ bỏ qua field `teacher`.
