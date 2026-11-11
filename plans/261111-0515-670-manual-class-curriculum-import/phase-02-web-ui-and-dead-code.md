---
phase: 2
title: "Phase 2: Web — Đồng bộ isManual, nút hành động, lỗi modal & dọn dead code (TDD)"
status: pending
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Web — Đồng bộ isManual, nút hành động, lỗi modal & dọn dead code (TDD)

<!-- Updated: Red Team & Validation Session 1 - Applied RT-7, RT-8, RT-9: splitSyllabi source-of-truth in schedule-week/day/month + effectiveSessionsTotal fallback when sessionsTotal=0, explicit failureError?.code allowlist + setError(undefined) instead of reset() on reopen in ImportSyllabusModal, zombie modal state cleanup for manageOpen/addSessionOpen in $classId.tsx -->

## Goal

Đồng bộ theo quy trình TDD (RED trước, GREEN sau) công thức nhận diện lớp `manual` và nguồn sự thật `syllabus.classId` (`splitSyllabi`) trên giao diện chi tiết lớp cùng lịch tuần/ngày/tháng, ẩn các nút thêm buổi thủ công bất hợp lệ trên lớp `auto` đã có `lesson` thật khi gỡ giáo trình, đóng sạch state modal khi điều kiện hiệu lực thay đổi, hiển thị thông báo tiếng Việt rõ ràng qua allowlist mã lỗi trong `ImportSyllabusModal` mà không làm mất `notice` (`submitBlocked`), và xóa sạch dead code `!sy` / `onOpenCurriculum` khỏi `ClassSessionsManageModal`.

## Files to Create / Modify

- Modify: `apps/web/src/routes/_auth/classes/$classId.test.tsx`
- Modify: `apps/web/src/components/modals/import-syllabus-modal.test.tsx`
- Modify: `apps/web/src/lib/schedule-week.test.ts`
- Modify: `apps/web/src/components/class-detail/class-sessions-section.tsx`
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx`
- Modify: `apps/web/src/lib/schedule-week.ts`
- Modify: `apps/web/src/lib/schedule-day.ts`
- Modify: `apps/web/src/lib/schedule-month.ts`
- Modify: `apps/web/src/components/modals/import-syllabus-modal.tsx`
- Modify: `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx`

## Tasks & Steps

### Task 2.1 — Viết bộ unit test RED cho Web UI, lịch tuần và `ImportSyllabusModal` (#670)
- **Goal**: Bổ sung các bài kiểm thử hành vi mới vào `$classId.test.tsx`, `import-syllabus-modal.test.tsx`, và `schedule-week.test.ts` để xác nhận chúng fail ở pha RED trước khi sửa code giao diện.
- **Target files and symbols**:
  - `apps/web/src/routes/_auth/classes/$classId.test.tsx`
  - `apps/web/src/components/modals/import-syllabus-modal.test.tsx`
  - `apps/web/src/lib/schedule-week.test.ts`
- **Steps**:
  1. Trong `apps/web/src/routes/_auth/classes/$classId.test.tsx`, thêm 2 bài `it(...)`:
     - **Ca 1 (Phòng thủ dữ liệu lệch tiền-#670: `schedulingMode: "manual"`, `sessionsTotal: 0` nhưng đã có bản sao `syllabus` 3 bài và `0 classSessions`):** Khẳng định `PageHead` hiện nút `"Sắp xếp buổi"` (không hiện `"+ Thêm buổi học"`), và tab **Buổi học & luyện tập** chiếu đủ 3 dòng `[data-testid="session-row"]` mang tiêu đề bài học từ `syllabus` thay vì rơi vào Empty State hay bảng legacy.
     - **Ca 2 (Lớp `auto` đã có dòng `lesson` thật nhưng `syllabusId: null` sau khi gỡ giáo trình):** Khẳng định cả `PageHead` lẫn header `Section` Sessions đều **ẩn** `"Sắp xếp buổi"`, `"+ Thêm buổi học"` và `"+ Thêm buổi"`, trong khi danh sách buổi thật của học viên vẫn hiển thị đầy đủ.
  2. Trong `apps/web/src/components/modals/import-syllabus-modal.test.tsx`, thêm 2 bài `it(...)`:
     - **Ca 1 (Hiển thị thông báo tiếng Việt qua allowlist `code` khi server trả `409` / `422`):** Mock response `409` `{ error: "Lớp đã có buổi học thủ công. Vui lòng xóa các buổi chưa học trước khi nhập giáo trình.", reason: "has-manual-sessions", code: "MANUAL_SESSIONS_EXIST" }` và `422` `{ error: "Template chưa có bài học nào. Vui lòng thêm ít nhất 1 bài học trước khi nhập vào lớp trống.", reason: "empty-template", code: "CURRICULUM_EMPTY_TEMPLATE" }`, khẳng định `role="alert"` hiển thị đúng thông báo tiếng Việt hướng dẫn giáo viên thay vì câu chung `"Không lưu được..."`.
     - **Ca 2 (Xóa `error` khi mở lại modal nhưng giữ nguyên `notice` / `submitBlocked`):** Kiểm chứng đóng rồi mở lại modal sau lỗi `409` sẽ xóa `role="alert"`, nhưng nếu modal đang ở trạng thái `committed` (`notice` hiển thị khi refresh thất bại) thì đóng rồi mở lại vẫn giữ nguyên `KernelSubmitNotice` và khóa nút `"Nhập giáo trình"`.
  3. Trong `apps/web/src/lib/schedule-week.test.ts` (khối `describe("selectProjectedWeekBlocks (issue #121)", ...)`), thêm 2 bài `test(...)`:
     - Lớp có `schedulingMode: "manual"`, `sessionsTotal: 0` nhưng có bản sao giáo trình hợp lệ trong `syllabi` (`classId === cls.id`, 3 bài học) vẫn được `selectProjectedWeekBlocks` chiếu đủ 3 buổi theo lịch tuần.
     - Lớp `manual` bị dính con trỏ dị thường `syllabusId: "sy-tpl"` trỏ vào template (`classId: null` trong `syllabi`, không có bản sao lớp) vẫn được nhận diện là `manual` và không bị chiếu lịch ảo.
- **Success criteria**: Ba file test biên dịch sạch và chạy fail ở pha RED đúng tại các bài test mới thêm.
- **Verify**: `pnpm --filter web exec vitest run 'src/routes/_auth/classes/$classId.test.tsx' src/components/modals/import-syllabus-modal.test.tsx src/lib/schedule-week.test.ts` kết thúc với mã thoát khác `0` do assertion failure ở các test mới; nếu lệnh thoát `0` ở bước này thì coi là thất bại.

### Task 2.2 — Cập nhật `class-sessions-section.tsx`, `$classId.tsx`, `schedule-week/day/month.ts`, `import-syllabus-modal.tsx` và dọn dead code `class-sessions-manage-modal.tsx` (TDD GREEN)
- **Goal**: Thực hiện chỉnh sửa đồng bộ trên các file Web để toàn bộ unit test chuyển sang GREEN và xóa sạch dead code `!sy` / `onOpenCurriculum`.
- **Target files and symbols**:
  - `apps/web/src/components/class-detail/class-sessions-section.tsx` (`ClassSessionsSection`)
  - `apps/web/src/routes/_auth/classes/$classId.tsx` (`ClassDetail`)
  - `apps/web/src/lib/schedule-week.ts` (`selectProjectedWeekBlocks`, `buildWeekModel`)
  - `apps/web/src/lib/schedule-day.ts` (`buildDayAgenda`)
  - `apps/web/src/lib/schedule-month.ts` (`buildMonthCells`)
  - `apps/web/src/components/modals/import-syllabus-modal.tsx` (`ImportSyllabusModal`)
  - `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx` (`ClassSessionsManageModalProps`, `ClassSessionsManageModal`)
- **Steps**:
  1. Trong `apps/web/src/components/class-detail/class-sessions-section.tsx`:
     - Tại dòng `113-123`, cập nhật công thức `isManual` và `effectiveSessionsTotal` (đặt `(classSessions?.length ?? 0) > 0` đứng đầu để bảo toàn hiển thị dữ liệu thật và fixture `#665` tại `$classId.sessions.test.tsx:601-639`):
       ```ts
       const isManual =
       	(classSessions?.length ?? 0) > 0 ||
       	(!syllabus && cls.schedulingMode === "manual");
       const syllabusLessonCount = syllabus
       	? syllabus.modules.reduce((sum, m) => sum + m.lessons.length, 0)
       	: 0;
       const effectiveSessionsTotal =
       	!isManual && cls.sessionsTotal === 0 && syllabusLessonCount > 0
       		? syllabusLessonCount
       		: cls.sessionsTotal;
       ```
     - Truyền `sessionsTotal: effectiveSessionsTotal` vào `buildClassSessions`.
     - Tại dòng `225`, đổi điều kiện `action` của `<Section title="Sessions" ...>` thành `!syllabus && (isManual || lessons.length === 0) && onAddSession`.
  2. Trong `apps/web/src/routes/_auth/classes/$classId.tsx`:
     - Giữ nguyên `const classLessons = data.lessons.filter((l) => cls.studentIds.includes(l.sid));` cho `legacyLessons`.
     - Tính một lần `classLessonsForClass` (`l.classId === classId`), `classSessionsForClass` (`cs.classId === classId`), `isManual = classSessionsForClass.length > 0 || (!sy && cls.schedulingMode === "manual")`, và `canAddManualSession = !sy && (isManual || classLessonsForClass.length === 0)`.
     - Thêm `useEffect` đồng bộ đóng state zombie: nếu `!sy && manageOpen` thì `setManageOpen(false)`; nếu `!canAddManualSession && addSessionOpen` thì `setAddSessionOpen(false)`.
     - Trên `PageHead` (`dòng 248-263`), hiện `"Sắp xếp buổi"` khi `sy`, hiện `"+ Thêm buổi học"` khi `canAddManualSession`, và `null` trong trường hợp còn lại.
     - Truyền `lessons={classLessonsForClass}` và `classSessions={classSessionsForClass}` vào `<ClassSessionsSection>`, truyền `open={manageOpen && Boolean(sy)}` (bỏ `onOpenCurriculum`) vào `<ClassSessionsManageModal>`, và truyền `open={addSessionOpen && canAddManualSession}` + `existingDateISOs={classSessionsForClass.map((cs) => cs.date)}` vào `<AddClassSessionModal>`.
  3. Trong `apps/web/src/lib/schedule-week.ts`, `schedule-day.ts`, và `schedule-month.ts`:
     - Mở rộng `selectProjectedWeekBlocks(classes, lessons, dates, classSessions = [], syllabi?: readonly Syllabus[])`: khi `syllabi !== undefined`, lấy `curriculumByClassId = splitSyllabi([...syllabi]).curriculumByClassId` từ `@/lib/repos/syllabus`; với mỗi `cls`, xác định `attachedCurriculum = syllabi !== undefined ? (curriculumByClassId.get(cls.id) ?? null) : null` và `hasCurriculum = syllabi !== undefined ? attachedCurriculum !== null : Boolean(cls.syllabusId)`.
     - Gom các dòng `classSessions` thuộc `cls.id` vào `byDate`; coi lớp là manual khi `byDate.size > 0 || (!hasCurriculum && cls.schedulingMode === "manual")`. Nếu không phải manual, tính `effectiveSessionsTotal` (dùng số bài học của `attachedCurriculum` khi `cls.sessionsTotal === 0`) rồi gọi `projectClassSessions`.
     - Trong `buildWeekModel` (`schedule-week.ts:281-303`), `buildDayAgenda` (`schedule-day.ts:119`), và `buildMonthCells` (`schedule-month.ts:237`), khai báo thêm `syllabi?: Syllabus[]` trên kiểu `data` và truyền `data.syllabi` làm đối số thứ 5 cho `selectProjectedWeekBlocks`.
  4. Trong `apps/web/src/components/modals/import-syllabus-modal.tsx`:
     - Lấy thêm `failureError, setError` từ `useKernelFormSubmit()`. Dùng `useRef` + `useEffect` (theo đúng mẫu `add-class-session-modal.tsx:101-118`) để khi `open` chuyển từ `false` sang `true` thì chỉ gọi `setError(undefined)` (không gọi `reset()` để giữ nguyên `notice` / `submitBlocked`), đồng thời gọi `setError(undefined)` khi người dùng đổi template trên `<TemplatePicker>`.
     - Viết hàm ánh xạ allowlist theo mã `code` (truyền từ `result.error` / `failureError?.code` khi `result?.kind === "definite-failure"`):
       - `"MANUAL_SESSIONS_EXIST"` → `"Lớp đã có buổi học thủ công. Vui lòng xóa các buổi chưa học trước khi nhập giáo trình."`
       - `"CURRICULUM_EMPTY_TEMPLATE"` → `"Template chưa có bài học nào. Vui lòng thêm ít nhất 1 bài học trước khi nhập vào lớp trống."`
       - `"CURRICULUM_TOO_MANY_LESSONS"` → `"Template vượt quá giới hạn 52 buổi học của lớp."`
       - `"CURRICULUM_TEMPLATE_TOO_LARGE"` → `"Template quá lớn để import."`
       - `"CURRICULUM_ALREADY_EXISTS"` → `"Lớp đã có giáo trình."`
       - `"CURRICULUM_MATERIAL_NOT_FOUND"` → `"Một số tài liệu gắn trong template không còn tồn tại trong ngân hàng tài liệu."`
       Khi khớp một mã trong allowlist thì gọi `setError(mappedMessage)`; mọi lỗi khác giữ nguyên câu mặc định an toàn của `useKernelFormSubmit` (bảo toàn 100% `itFollowsTheKernelFormContract` và không bao giờ lộ chuỗi nội bộ thô).
  5. Trong `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx`:
     - Xóa `onOpenCurriculum: () => void` khỏi `ClassSessionsManageModalProps` và tham số hàm `ClassSessionsManageModal`.
     - Ngay sau các hooks (`useClassCurriculum`, `useState`, `useSyllabusMutations`) và `const sy = curriculum;`, thêm `if (!sy) return null;`.
     - Xóa nhánh dead code `!sy ? (...) : (...)` (dòng `71-80`), giữ nguyên phần thân cây module/lesson và các modal con bên trong `<Modal open={open} onClose={onClose} title="Quản lý buổi của lớp">`.
- **Success criteria**: Toàn bộ test suite của `apps/web` và kiểm tra kiểu TypeScript đều xanh, không còn bất kỳ tham chiếu nào tới `onOpenCurriculum` hay chuỗi `"Gắn giáo trình cho lớp để sắp xếp buổi"` trong `apps/web/src`.
- **Verify**: `pnpm --filter web test && pnpm --filter web check-types && ! grep -rnE "Gắn giáo trình cho lớp để sắp xếp buổi|onOpenCurriculum" apps/web/src` kết thúc với mã thoát `0`.

## Verification

- [ ] `pnpm --filter web test` pass 100% (bao gồm `$classId.test.tsx`, `$classId.sessions.test.tsx`, `import-syllabus-modal.test.tsx`, `schedule-week.test.ts`).
- [ ] `pnpm --filter web check-types` exit `0`.
- [ ] Không còn tham chiếu `onOpenCurriculum` hoặc `"Gắn giáo trình cho lớp để sắp xếp buổi"` trong `apps/web/src`.

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
