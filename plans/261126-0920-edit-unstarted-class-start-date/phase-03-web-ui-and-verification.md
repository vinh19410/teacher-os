---
phase: 3
title: "Phase 3: Web UI, Tests & Verification"
status: done
priority: P1
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: Web UI, Tests & Verification

## Goal

Cập nhật giao diện giáo viên (`$classId.tsx`, `EditClassModal`, `ConfirmOpeningModal`, `useKernelFormSubmit`, `class-opening.ts`) để mở khóa ô "Ngày khai giảng" khi lớp chưa bắt đầu (kể cả đã có học viên/buổi dự kiến, khóa cho vai trò `ta`), giữ khóa lịch tuần & tổng số buổi, chuẩn hóa 1 định nghĩa `isManual` duy nhất khớp server, hiển thị cảnh báo trùng lịch realtime khi đổi `startDate`, và kiểm chứng đầy đủ bằng component tests, E2E `edit-class.spec.ts`, cùng screenshot 3 viewport light/dark theo `REVIEW.md`.

## Files to Create / Modify

- Modify: `apps/web/src/lib/use-kernel-form-submit.ts` (map `CLASS_ERROR_CODES.START_DATE_LOCKED`, auto-refresh snapshot khi gặp `START_DATE_LOCKED`, cập nhật copy `SCHEDULE_LOCKED`)
- Modify: `apps/web/src/lib/repos/class-opening.ts` (map `CLASS_ERROR_CODES.START_DATE_LOCKED` trong `defaultErrorMessage`)
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` (chuẩn hóa `isManual = !sy && (cls?.schedulingMode === "manual" || classSessionsForClass.length > 0)`, tính `startDateEditability` từ `evaluateClassStartDateEditability` kèm `holidayShifts`/`holidayCancels`, khóa cho `!canToggleStatus` (`ta`), truyền `isManual` / `startDateLocked` / `startDateLockReason` / `canEditStartDate` xuống `EditClassModal` và `ConfirmOpeningModal`)
- Modify: `apps/web/src/components/modals/edit-class-modal.tsx` (tách `startDateLocked` khỏi `hasRealSessions`, nhận `isManual` + `canEditStartDate`, bật sửa `Ngày khai giảng` khi `!effectiveStartDateLocked`, sửa `showScheduleConflicts` bỏ chặn `!hasRealSessions`, cập nhật ghi chú UX, chặn xóa rỗng `startDate` khi `hasRealSessions && !isManualMode`)
- Modify: `apps/web/src/components/modals/confirm-opening-modal.tsx` (dùng `startDateLocked` thay cho `hasRealSessions` ở cổng read-only ngày khai giảng, nhận `isManual`, thêm `START_DATE_LOCKED` vào `REFRESH_REQUIRED_ERROR_CODES`, thêm ghi chú đồng bộ lịch buổi học khi đổi ngày ở lớp `auto` có `hasRealSessions`)
- Modify: `apps/web/src/components/modals/edit-class-modal.test.tsx` (TDD component tests)
- Modify: `apps/web/src/components/modals/confirm-opening-modal.test.tsx` (TDD component tests)
- Modify: `apps/web/src/routes/_auth/classes/$classId.test.tsx` (integration test trang chi tiết lớp: lớp có `lesson` `upcoming`, `completed`, `holidayCancels`, và vai trò `ta`)
- Modify: `apps/e2e/specs/edit-class.spec.ts` (E2E kịch bản đổi ngày khai giảng khi lớp đã có học viên chưa bắt đầu + cập nhật danh sách buổi học + khóa sau khi điểm danh + screenshot POT 3 viewport light/dark)

## Tasks & Steps

### Task 3.1 — Write TDD web component & route tests (Red)

- **Goal:** Viết trước component tests cho `EditClassModal`, `ConfirmOpeningModal`, và route `$classId.test.tsx` để đặc tả chính xác trạng thái enable/disable, payload gửi lên API, cảnh báo trùng lịch, phân quyền `ta`, và copy UX.
- **Target files:** `apps/web/src/components/modals/edit-class-modal.test.tsx`, `apps/web/src/components/modals/confirm-opening-modal.test.tsx`, `apps/web/src/routes/_auth/classes/$classId.test.tsx`.
- **Steps:**
  1. Trong `edit-class-modal.test.tsx`:
     - Test khi `hasRealSessions={true}` và `startDateLocked={false}` (lớp `auto` đã có học viên nhưng chưa bắt đầu): Ngày học / Giờ bắt đầu / Giờ kết thúc / Tổng số buổi vẫn `disabled`, **nhưng ô `Ngày khai giảng` được `enabled`**, đổi ngày và bấm "Lưu thay đổi" gửi `PATCH` có `startDate` mới (không gửi `schedule` / `sessionsTotal`), **hiển thị banner cảnh báo trùng lịch `schedule-conflict-warning`** khi trùng lớp khác, chặn xóa trống ngày khai giảng trên lớp `auto`, và hiển thị gợi ý bấm "Thông báo khai giảng" nếu lớp đã từng chốt khai giảng (`openingAnnouncementVersion > 0`).
     - Test khi `hasRealSessions={true}`, `startDateLocked={false}`, `isManual={true}` (kể cả legacy `cls.schedulingMode === "auto"` có `class_session`): hiển thị đúng ghi chú lớp thủ công (buổi thủ công giữ nguyên ngày) và cho phép sửa `Ngày khai giảng`.
     - Test khi `hasRealSessions={true}` và `startDateLocked={true}` (lớp đã bắt đầu hoặc `canEditStartDate={false}` với vai trò `ta`): ô `Ngày khai giảng` bị `disabled` kèm thông báo đúng nguyên nhân, không gửi `startDate` trong `PATCH`.
     - Test khi server trả `409 CLASS_START_DATE_LOCKED`: hiển thị đúng thông báo lỗi và gọi refresh snapshot.
  2. Trong `confirm-opening-modal.test.tsx`:
     - Test khi `hasRealSessions={true}` và `startDateLocked={false}`: ở mode `initial` và `all`, ô `Ngày khai giảng *` vẫn chỉnh sửa được và gửi `startDate` mới lên `POST /api/classes/:id/confirm-opening` (kèm ghi chú ngắn rằng lịch các buổi học sẽ tự cập nhật theo ngày mới khi `!isManual`); ở mode `new_only` vẫn read-only.
     - Test khi `startDateLocked={true}`: hiển thị `opening-date-readonly` và ghi chú lớp đã bắt đầu nên không đổi được ngày khai giảng.
     - Test nhận lỗi `409 CLASS_START_DATE_LOCKED`: hiển thị lỗi và gọi `onConfirmed()` để làm mới snapshot.
  3. Trong `$classId.test.tsx`:
     - Test lớp có `lesson` `upcoming` (chưa điểm danh): mở `EditClassModal` và `ConfirmOpeningModal` đều thấy ô `Ngày khai giảng` enabled.
     - Test lớp có `lesson` `completed` (hoặc `absent` / `cancelled` không thuộc `holidayCancels`): mở `EditClassModal` thấy ô `Ngày khai giảng` disabled.
     - Test lớp có `lesson` `cancelled` thuộc `holidayCancels` (chưa học buổi nào): ô `Ngày khai giảng` vẫn enabled.
     - Test viewer `role: "ta"` mở `EditClassModal` trên lớp chưa bắt đầu: ô `Ngày khai giảng` bị `disabled`. <!-- Updated: Validation Session 1 & Red-Team RT-4 -->
  4. Chạy vitest 3 file trên để xác nhận fail (red phase).
- **Success criteria:** Các test mới thất bại đúng do component chưa hỗ trợ `startDateLocked` / `isManual` / `canEditStartDate`.
- **Verify:** `pnpm --filter web test -- src/components/modals/edit-class-modal.test.tsx src/components/modals/confirm-opening-modal.test.tsx src/routes/_auth/classes/\$classId.test.tsx` exits non-zero; passing is a failure.

### Task 3.2 — Implement Web UI & error handling changes (Green)

- **Goal:** Cập nhật toàn bộ web layer dùng chung `evaluateClassStartDateEditability` từ `@teacher-os/api/class-start-date`, đảm bảo tuân thủ token & quy tắc `DESIGN.md`.
- **Target files:**
  - `apps/web/src/lib/use-kernel-form-submit.ts`
  - `apps/web/src/lib/repos/class-opening.ts`
  - `apps/web/src/routes/_auth/classes/$classId.tsx`
  - `apps/web/src/components/modals/edit-class-modal.tsx`
  - `apps/web/src/components/modals/confirm-opening-modal.tsx`
- **Steps:**
  1. `use-kernel-form-submit.ts`:
     - Cập nhật `CLASS_ERROR_CODES.SCHEDULE_LOCKED` message thành `"Lớp đã có buổi học thực tế nên không sửa được lịch học hoặc số buổi. Bạn vẫn có thể lưu các thay đổi khác."`.
     - Thêm case `CLASS_ERROR_CODES.START_DATE_LOCKED`: `"Lớp đã bắt đầu học hoặc lịch không hỗ trợ dời tự động nên không sửa được ngày khai giảng. Dữ liệu lớp đã được tải lại."`.
     - Trong nhánh `definite-failure`, gọi `void refresh()` cho cả `CLASS_ERROR_CODES.CLASS_PAUSED` và `CLASS_ERROR_CODES.START_DATE_LOCKED`.
  2. `class-opening.ts`:
     - Thêm nhánh `code === CLASS_ERROR_CODES.START_DATE_LOCKED` trong `defaultErrorMessage` trả `"Lớp đã bắt đầu học nên không thể đổi ngày khai giảng."`.
  3. `$classId.tsx`: <!-- Updated: Red-Team RT-4, RT-7, RT-10 -->
     - Import `evaluateClassStartDateEditability` từ `@teacher-os/api/class-start-date`.
     - Chuẩn hóa `isManual` khớp 1-1 với server `isManualClass`: `const isManual = !sy && (cls?.schedulingMode === "manual" || classSessionsForClass.length > 0);`.
     - Tính `holidayCancelDatesForClass` từ `data.holidayCancels` và `holidayShiftsForClass` từ `data.holidayShifts`.
     - Tính `startDateEditability = cls ? evaluateClassStartDateEditability({ schedule: cls.schedule, sessionsTotal: cls.sessionsTotal, isManual, lessons: classLessonsForClass.map((l) => ({ date: l.date ?? null, status: l.status, enrollmentKey: l.sid, attendance: l.attendance, attendanceNote: l.attendanceNote })), holidayCancelDates: holidayCancelDatesForClass, holidayShifts: holidayShiftsForClass }) : { editable: false, reason: "class-started" as const }`.
     - Truyền `isManual={isManual}`, `startDateLocked={!startDateEditability.editable}`, `startDateLockReason={startDateEditability.reason}`, `canEditStartDate={canToggleStatus}` vào `<EditClassModal>` và `isManual={isManual}`, `startDateLocked={!startDateEditability.editable}`, `startDateLockReason={startDateEditability.reason}` vào `<ConfirmOpeningModal>`.
  4. `edit-class-modal.tsx`: <!-- Updated: Red-Team RT-4, RT-10 -->
     - Mở rộng `EditClassModalProps`: thêm `isManual?: boolean`, `startDateLocked?: boolean` (default `hasRealSessions` để giữ tương thích test/caller cũ), `startDateLockReason?: StartDateLockReason | null`, `canEditStartDate?: boolean` (default `true`).
     - Tính `isManualMode = isManual ?? (cls.schedulingMode === "manual" && !curriculum)`.
     - Tính `effectiveStartDateLocked = !canEditStartDate || (startDateLocked ?? hasRealSessions)`.
     - Cập nhật `scheduleConflicts` memo: khi `!hasRealSessions` dùng `days`/`startTime`/`endTime`/`draftTotal`; khi `hasRealSessions && !effectiveStartDateLocked && trimmedStartDate !== cls.startDate.trim() && parsedInitialSchedule !== null && cls.sessionsTotal > 0` vẫn gọi `findScheduleConflicts` với `parsedInitialSchedule` + `startDateInputValue` + `cls.sessionsTotal`.
     - **Cập nhật `showScheduleConflicts` (dòng 251–252):** đổi thành `const showScheduleConflicts = (!hasRealSessions || !effectiveStartDateLocked) && !saving && !notice && scheduleConflicts.length > 0;`!
     - Tách kiểm tra & gán `payload.startDate` ra khỏi `if (!hasRealSessions)` thành khối riêng `if (!effectiveStartDateLocked)`:
       - Nếu `hasRealSessions && !isManualMode && startDateChanged && trimmedStartDate === ""`: báo lỗi `"Lớp đã có buổi học nên không thể xóa trống ngày khai giảng."`.
       - Giữ nguyên check `startDateInvalid`, `isValidIsoCalendarDate`, `trimmedStartDate < todayVN`.
     - Cập nhật `<DatePickerInput>` `disabled={effectiveStartDateLocked || saving}`.
     - Cập nhật banner `data-testid="schedule-locked-note"` và ghi chú phụ (dùng token `border-border bg-muted text-muted-foreground` chuẩn `DESIGN.md`, không hard-code hex):
       - Khi `!canEditStartDate`: giải thích ngắn trên `help` của `Ngày khai giảng` (`"Chỉ giáo viên phụ trách hoặc quản trị viên mới có thể thay đổi ngày khai giảng."`).
       - Khi `hasRealSessions && !effectiveStartDateLocked`:
         - Lớp `auto`: `"Lớp đã có học viên/buổi học dự kiến nên lịch học trong tuần và tổng số buổi được khóa. Bạn vẫn có thể đổi ngày khai giảng khi lớp chưa bắt đầu — lịch các buổi học sẽ tự động cập nhật theo ngày mới."`
         - Lớp `manual`: `"Lớp đã có buổi học thủ công nên lịch học và tổng số buổi được khóa. Bạn vẫn có thể đổi ngày khai giảng hiển thị (các buổi thủ công đã thêm giữ nguyên ngày)."`
       - Khi `hasRealSessions && effectiveStartDateLocked` (với `canEditStartDate`):
         - `reason === "legacy-undated" || reason === "invalid-schedule"`: `"Lớp dùng lịch định dạng cũ hoặc đã điều chỉnh buổi lẻ nên lịch học, ngày khai giảng và tổng số buổi được khóa. Bạn vẫn có thể chỉnh sửa thông tin chung của lớp."`
         - Mặc định (`"class-started"`): `"Lớp đã bắt đầu học nên lịch học, ngày khai giảng và tổng số buổi được khóa. Bạn vẫn có thể chỉnh sửa thông tin chung của lớp."`
       - Nếu `!effectiveStartDateLocked && ((cls.openingAnnouncementVersion ?? 0) > 0 || Boolean(cls.openingConfirmedAt)) && trimmedStartDate !== cls.startDate.trim()`: hiện dòng ghi chú nhỏ (`role="note"`) nhắc `"Lớp đã từng chốt khai giảng. Sau khi lưu, hãy mở «Thông báo khai giảng» nếu muốn gửi email cập nhật ngày mới cho học viên."`.
  5. `confirm-opening-modal.tsx`: <!-- Updated: Red-Team RT-10 -->
     - Mở rộng `ConfirmOpeningModalProps`: thêm `isManual?: boolean`, `startDateLocked?: boolean` (default `hasRealSessions`), `startDateLockReason?: StartDateLockReason | null`.
     - Thêm `CLASS_ERROR_CODES.START_DATE_LOCKED` vào `REFRESH_REQUIRED_ERROR_CODES`.
     - Đổi `startDateReadOnly = effectiveStartDateLocked || (isAlreadyConfirmed && effectiveSendMode === "new_only")`.
     - Cập nhật copy ở `opening-date-locked-note`: khi `effectiveStartDateLocked`, nêu rõ `"Lớp đã bắt đầu học nên ngày khai giảng được giữ cố định."` (hoặc `"Lớp dùng lịch định dạng cũ hoặc đã điều chỉnh buổi lẻ nên ngày khai giảng được giữ cố định."` nếu `legacy-undated`/`invalid-schedule`).
     - Tính `isManualMode = isManual ?? cls.schedulingMode === "manual"`. Khi `!startDateReadOnly && hasRealSessions && !isManualMode && trimmedStartDate !== cls.startDate.trim()`: hiện dòng `help` trên `<Field label="Ngày khai giảng *">` nói rõ `"Lịch các buổi học chưa diễn ra của lớp sẽ tự động cập nhật theo ngày khai giảng mới."`.
  6. Chạy web unit/component tests + typecheck web.
- **Success criteria:** Tất cả tests trong `edit-class-modal.test.tsx`, `confirm-opening-modal.test.tsx`, `$classId.test.tsx` đều pass; `pnpm --filter web check-types` xanh.
- **Verify:** `pnpm --filter web test -- src/components/modals/edit-class-modal.test.tsx src/components/modals/confirm-opening-modal.test.tsx src/routes/_auth/classes/\$classId.test.tsx && pnpm --filter web check-types` exits 0.

### Task 3.3 — Update E2E spec `edit-class.spec.ts` & capture UI verification (3 viewports + light/dark)

- **Goal:** Kiểm chứng end-to-end luồng đổi ngày khai giảng khi lớp đã có học viên chưa bắt đầu (cập nhật thực tế trên UI danh sách buổi học & stat card), luồng khóa sau khi điểm danh, và chụp screenshot POT 3 viewport (`1440×900`, `768×1024`, `375×812`) + light/dark theo `REVIEW.md`.
- **Target files:** `apps/e2e/specs/edit-class.spec.ts`.
- **Steps:**
  1. Cập nhật test 3 trong `apps/e2e/specs/edit-class.spec.ts`:
     - Trên lớp `manual` có `class_session` chưa điểm danh: xác nhận `Ngày học`, `Giờ bắt đầu`, `Giờ kết thúc`, `Tổng số buổi` vẫn `disabled`, còn `Ngày khai giảng` được `enabled` và lưu được ngày mới trong khi buổi thủ công giữ nguyên ngày.
  2. Bổ sung test mới trong `apps/e2e/specs/edit-class.spec.ts`:
     - Seed lớp `auto` với 1 học viên `active` (lớp chưa bắt đầu, đã sinh `lesson` `upcoming`): mở `EditClassModal`, kiểm tra `Ngày học`/`Giờ`/`Tổng số buổi` disabled, `Ngày khai giảng` enabled, đổi ngày khai giảng sang +14 ngày, lưu, xác nhận `StatCard` hiển thị `Từ <ngày mới>` và các `session-row` trên trang chi tiết lớp cập nhật sang ngày mới!
     - Seed lớp có buổi hôm nay đã điểm danh (`check-in`), mở `EditClassModal` xác nhận `Ngày khai giảng` bị `disabled` và hiển thị thông báo khóa lớp đã bắt đầu.
  3. Cập nhật khối `CAPTURE_POT === "1"` chụp ảnh `EditClassModal` trạng thái lớp chưa bắt đầu đã có học viên (lịch tuần khóa, ngày khai giảng mở) ở 3 viewport (`desktop`, `tablet`, `mobile`) × 2 theme (`light`, `dark`) vào `plans/reports/`.
  4. Chạy spec E2E lẻ `edit-class.spec.ts` với port override (`E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105`) và `CAPTURE_POT=1`, mở xem ảnh kiểm chứng không tràn/cắt/lỗi contrast theo `REVIEW.md`.
- **Success criteria:** `edit-class.spec.ts` pass 100%, ảnh 3 viewport × light/dark sạch lỗi layout/a11y.
- **Verify:** `CAPTURE_POT=1 E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/edit-class.spec.ts` exits 0 and passes all tests.

### Task 3.4 — Run full local quality gates

- **Goal:** Xác minh toàn bộ repo sạch lint, type, và unit/integration test sau toàn bộ thay đổi.
- **Target files:** Toàn bộ workspace (chỉ đọc/verify).
- **Steps:**
  1. Chạy `pnpm exec biome check . && pnpm check-types && pnpm test`.
- **Success criteria:** Cả 3 gate exit 0 với 0 lỗi.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm test` exits 0.

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

## Verification

- `pnpm --filter web test`
- `pnpm exec biome check . && pnpm check-types && pnpm test`
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/edit-class.spec.ts`

## Risk & Rollback

- **Risk:** Test cũ ở `edit-class-modal.test.tsx`, `confirm-opening-modal.test.tsx`, hoặc `edit-class.spec.ts` kiểm tra `hasRealSessions` khóa luôn `Ngày khai giảng` — đã chủ động cập nhật default prop `startDateLocked = hasRealSessions`, `canEditStartDate = true` cho test cũ, và cập nhật đúng kịch bản `edit-class.spec.ts` phân tách lớp chưa bắt đầu vs lớp đã bắt đầu.
- **Rollback:** Revert các file UI đã sửa trong `apps/web/src/` và `apps/e2e/specs/edit-class.spec.ts`.
