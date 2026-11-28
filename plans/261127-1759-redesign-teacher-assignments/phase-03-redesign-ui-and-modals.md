---
phase: 3
title: "UI Redesign /teacher/assignments & Modals"
status: pending
priority: P1
effort: "4.5h"
dependencies: [1, 2]
---

# Phase 3: UI Redesign `/teacher/assignments` & Modals

## Goal

Thay toàn bộ giao diện `/teacher/assignments` theo `open-design/assignments.html` bằng component tách nhỏ dùng token Light/Dark từ `globals.css`, giữ nguyên toàn bộ rich preview & bất biến a11y/#847, đồng thời triển khai đầy đủ modal Giao đề cho nhiều lớp, Nhân bản và Xóa bản nháp thật.

## Files to Create / Modify

- Create: `apps/web/src/components/assignments/prompt-status-badge.tsx`
- Create: `apps/web/src/components/assignments/prompt-student-paper.tsx`
- Create: `apps/web/src/components/assignments/prompt-preview-panel.tsx`
- Modify: `apps/web/src/components/assignments/prompt-preview-aside.tsx`
- Modify: `apps/web/src/components/assignments/prompt-preview-aside.test.tsx`
- Create: `apps/web/src/components/assignments/create-assignment-menu.tsx`
- Create: `apps/web/src/components/assignments/assign-prompt-to-classes-modal.tsx`
- Create: `apps/web/src/components/assignments/assign-prompt-to-classes-modal.test.tsx`
- Create: `apps/web/src/components/assignments/delete-draft-prompt-modal.tsx`
- Create: `apps/web/src/components/assignments/delete-draft-prompt-modal.test.tsx`
- Modify: `apps/web/src/routes/_auth/assignments/index.tsx`
- Modify: `apps/web/src/routes/_auth/assignments/index.test.tsx`

## Tasks & Steps

### Task 3.1 — Tạo `PromptStatusBadge`, `PromptStudentPaper`, `PromptPreviewPanel` và giữ tương thích `PromptPreviewAside`
- **Goal:** Tách biệt rõ header quản trị giáo viên (có Band & trạng thái giao lớp) với tờ đề phía học viên (`PromptStudentPaper` — không có Band & không lộ đáp án), kèm Tab 2 `Lịch sử giao` lấy dữ liệu thật từ `data.classAssignments` (đóng #979) và chế độ drawer `< 1360px` / sticky split `min-[1360px]`.
- **Target files and symbols:**
  - `apps/web/src/components/assignments/prompt-status-badge.tsx` (`PromptStatusBadge`)
  - `apps/web/src/components/assignments/prompt-student-paper.tsx` (`PromptStudentPaper`)
  - `apps/web/src/components/assignments/prompt-preview-panel.tsx` (`PromptPreviewPanel`)
  - `apps/web/src/components/assignments/prompt-preview-aside.tsx` (`PromptPreviewAside`)
  - `apps/web/src/components/assignments/prompt-preview-aside.test.tsx`
- **Steps:**
  1. Tạo `PromptStatusBadge`: chấm tròn + nhãn cho `draft` (viền đứt), `ready`/`open` (`bg-success`), `used` (`bg-foreground`), `late` (`bg-destructive` + `text-destructive`), `closed` (`bg-muted-foreground`), không dùng hex cứng.
  2. Tạo `PromptStudentPaper`: chuyển toàn bộ phần render nội dung bài làm từ `PromptPreviewAside` (audio `audioName` không bịa duration, `RichTextBody`, reading diagram & listening map `<img>`, `PinOverlay`, `OptionBankList`, `ClozeStemText`, hybrid `writing`, Speaking cue card, spec footer `part.spec`, word count Writing, draft note) vào `.paper` (`rounded-md border border-border bg-card p-4`). Tuyệt đối không render `Band` hay đáp án.
  3. Tạo `PromptPreviewPanel`:
     - Trên `min-[1360px]`: sticky panel `w-full min-[1360px]:sticky min-[1360px]:top-6 min-[1360px]:max-h-[calc(100vh-48px)]`.
     - Dưới `1360px`: slide-over right drawer `fixed inset-y-0 right-0 z-50 w-[min(440px,100vw)] border-l bg-card shadow-lg` + scrim `z-40 bg-black/50`, phím `Escape` chỉ đóng drawer khi `!document.querySelector('[role="dialog"]')`.
     - Header `.preview-head`: kicker, `<p>` tiêu đề (`font-semibold text-lg`, không dùng `<h2>`), `PromptStatusBadge`, `Tag` `Band ${fmtBandDisplay(prompt.band)}`, `level`, `Kèm Writing`, `Chấm tự động`, dòng `source · thêm dd/mm`.
     - Tablist (`role="tablist"`): `Đề phía học viên` và `Lịch sử giao` + `<span aria-hidden="true">({historyItems.length})</span>`, hỗ trợ ArrowLeft/ArrowRight chuyển tab & focus.
     - Tab 2: list lịch sử giao (`buildHistoryItemView`) có `<Link to="/classes/$classId" params={{ classId }} search={{ tab: "assignments" }}>`, `PromptStatusBadge`, thanh tiến độ `role="img"`, `Đã nộp X/Y` và `Hạn ...`, hoặc empty state `Chưa giao cho lớp nào`.
     - Footer: `ready` → `Giao cho lớp` (nếu `canManage`), hàng phụ `Xem trước` + `Sửa` + `Nhân bản`; `draft` → `Hoàn thiện bản nháp`, dòng gợi ý, hàng phụ `Xem trước` + `Nhân bản` + `Xóa nháp` (nếu `canManage`).
  4. Cập nhật `PromptPreviewAside` dùng `PromptStudentPaper` để giữ pass 100% các unit test cũ trong `prompt-preview-aside.test.tsx`.
- **Success criteria:** `prompt-preview-aside.test.tsx` pass và `PromptStudentPaper` khẳng định không chứa `Band 7.0` hay đáp án bí mật.
- **Verify:** `pnpm --filter web exec vitest run src/components/assignments/prompt-preview-aside.test.tsx` exits 0.

### Task 3.2 — Tạo `CreateAssignmentMenu`, `AssignPromptToClassesModal` và `DeleteDraftPromptModal`
- **Goal:** Có đầy đủ 3 luồng điều hướng/tác vụ tương tác thật với kernel, đảm bảo `DatePickerInput` hoạt động mượt trong `<Modal>`, xử lý partial failure khi giao nhiều lớp và RBAC `canPublishGrade`.
- **Target files and symbols:**
  - `apps/web/src/components/assignments/create-assignment-menu.tsx` (`CreateAssignmentMenu`)
  - `apps/web/src/components/assignments/assign-prompt-to-classes-modal.tsx` (`AssignPromptToClassesModal`)
  - `apps/web/src/components/assignments/delete-draft-prompt-modal.tsx` (`DeleteDraftPromptModal`)
  - `apps/web/src/components/assignments/assign-prompt-to-classes-modal.test.tsx`
  - `apps/web/src/components/assignments/delete-draft-prompt-modal.test.tsx`
- **Steps:**
  1. Tạo `CreateAssignmentMenu`: nút chính `Tạo bài tập` (`Plus` + `ChevronDown`), menu `role="menu"` gồm `Bài lẻ` (`/assignments/new`) và `Đề thi nhiều phần` (`/assignments/tests/new`), điều hướng ArrowUp/ArrowDown/Escape/click-outside.
  2. Tạo `AssignPromptToClassesModal`:
     - Bọc bằng `<Modal open={open} onClose={...} title="Giao đề cho lớp" description={prompt.title} scrollableBody footer={...}>` (tuyệt đối không dùng `<dialog>`).
     - Render danh sách lớp từ `data.classes`: disable lớp đã giao đề này (`Đã giao · hạn dd/mm`), lớp `paused` (`Lớp đang tạm dừng`), lớp `studentIds.length === 0` (`Chưa có học viên trong lớp` / nêu số `invitedStudentIds` nếu > 0).
     - Hạn nộp mặc định `+7 ngày` (theo `vietnamTodayISO`) và `21:00`, dùng `DatePickerInput` + `TimeInput24h` + 4 nút chọn nhanh (`Hôm nay`, `2 ngày nữa`, `1 tuần`, `2 tuần`).
     - Validate ngày/giờ VN (`parseStartDateStrict`, `parseTimeHHMM`, `vietnamDateTimeMs`), hiện inline error từng trường + error summary box (`tabIndex={-1}`, link nhảy focus) khi có >1 lỗi.
     - Submit tuần tự qua `dispatch({ type: "assign-class-prompt", ... }, { skipRefresh: true })` (`studentIds: cls.studentIds.slice(0, 100)`, `targetScope: cls.studentIds.length <= 100 ? "class" : "selected"`), cuối vòng gọi `await refresh()` một lần. Nếu có lớp lỗi hoặc `outcome-unknown`, bỏ tick các lớp đã thành công và giữ modal mở kèm danh sách lỗi rõ ràng.
  3. Tạo `DeleteDraftPromptModal`: `<Modal>` xác nhận xóa bản nháp dùng `useKernelFormSubmit()`, dispatch `{ type: "delete-assignment-prompt", promptId: prompt.id }`, hiện `error` và `<KernelSubmitNotice>` khi `committed`/`unknown`, đóng modal và báo toast `"Đã xóa bản nháp"` khi `refreshed`.
  4. Viết unit test cho cả hai modal (`assign-prompt-to-classes-modal.test.tsx`, `delete-draft-prompt-modal.test.tsx`).
- **Success criteria:** Unit test hai modal pass xanh, không dùng `<dialog>` hay parse date local.
- **Verify:** `pnpm --filter web exec vitest run src/components/assignments/assign-prompt-to-classes-modal.test.tsx src/components/assignments/delete-draft-prompt-modal.test.tsx` exits 0.

### Task 3.3 — Redesign `apps/web/src/routes/_auth/assignments/index.tsx` và cập nhật `index.test.tsx`
- **Goal:** Ghép toàn bộ layout master-detail mới vào route `/_auth/assignments/`, đồng bộ URL, keyboard navigation, phím tắt `/`, nhân bản và cập nhật test SSR.
- **Target files and symbols:**
  - `apps/web/src/routes/_auth/assignments/index.tsx` (`Route`, `AssignmentsRoute`)
  - `apps/web/src/routes/_auth/assignments/index.test.tsx`
- **Steps:**
  1. Cập nhật `Route.validateSearch` dùng `validateAssignmentsSearch`.
  2. Xây dựng phần `PageHead` (`Bài tập`, lead copy, nút outline `Bộ đề tự học`, `<CreateAssignmentMenu />`), 4 KPI filter tiles (`grid-cols-2 md:grid-cols-4`), Toolbar (`/` shortcut được guard khi đang mở `[role="dialog"]` hoặc gõ trong input/select/textarea/contenteditable; mobile `Bộ lọc` toggle; 3 `<select>` dùng `border-input` + `.select-chevron`; thanh segmented kỹ năng cuộn ngang với `aria-hidden="true"` counts; active chips + `Xóa bộ lọc`; một vùng `aria-live="polite"` duy nhất `Hiện <strong>N</strong> / M đề`).
  3. Xây dựng workspace `grid-cols-[minmax(0,1fr)] min-[1360px]:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_392px] gap-5 2xl:gap-6 items-start`:
     - Bảng danh sách `@container` (`@max-[640px]` chuyển sang stacked mobile card): header 5 cột `grid-cols-[minmax(0,1fr)_128px_48px_136px_80px] gap-3 px-4`.
     - Mỗi hàng đặt `<h3 className="min-w-0 truncate font-semibold text-sm"><button type="button" id={titleId} ...>` để giữ heading + button locator; quick actions dùng `aria-label="Giao cho lớp"` / `"Hoàn thiện bản nháp"` / `"Nhân bản"` + `aria-describedby={titleId}` (không nhét title vào `aria-label`).
     - Hỗ trợ ArrowUp/ArrowDown giữa các hàng, tự chọn item đầu tiên khi `isWide` và selection hiện tại bị lọc mất.
     - Kết nối `PromptPreviewPanel`, `AssignPromptToClassesModal`, `DeleteDraftPromptModal`, và `handleDuplicate` (`buildDuplicatePromptPayload` + `dispatch("create-assignment-prompt")` + reset filter nếu bản sao bị ẩn + toast `"Đã tạo bản sao ở dạng bản nháp"`).
  4. Cập nhật `apps/web/src/routes/_auth/assignments/index.test.tsx` kiểm tra toàn bộ copy mới, 4 KPI tiles, 3 select, skill tabs với `aria-hidden` counts, bảng + trạng thái `"Đã giao 1 lớp"`, preview panel + tab lịch sử giao, không lộ đáp án hay Band trong `PromptStudentPaper`, và empty state.
- **Success criteria:** `index.test.tsx` và toàn bộ test assignments pass xanh; `pnpm check-types` không lỗi.
- **Verify:** `pnpm --filter web exec vitest run src/routes/_auth/assignments/index.test.tsx src/components/assignments/prompt-preview-aside.test.tsx src/components/assignments/assign-prompt-to-classes-modal.test.tsx src/components/assignments/delete-draft-prompt-modal.test.tsx && pnpm check-types` exits 0.

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
