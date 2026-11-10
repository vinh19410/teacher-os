# Phase 01 — Badge «Đã dời» cho bucket manual 0 lesson

> Plan handover (`--advice`): mỗi task tự chứa đủ context, Verify là phép so
> sánh cơ học (command + kết quả mong đợi). Thực hiện task theo đúng thứ tự.

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

## Bối cảnh tóm tắt (executor không đọc issue)

- Lớp **manual** có danh sách buổi từ `class_sessions` (`ClassSessionItem`).
  Bucket = 1 ngày của lớp; `rows` = lesson rows cùng ngày. Bucket 0 row +
  tồn tại `holiday_session_shift.originalDate === dateISO` → buổi thật đã dời
  sang `makeupDate`, nhưng UI hôm nay render «Sắp tới».
- Data đã có sẵn phía web: `useData().data.holidayShifts:
  KernelHolidayShiftRow[]` (`{holidayId?, classId, originalDate, makeupDate}`,
  toàn org). Helper lookup có sẵn: `makeupDateForShift(snapshot,
  classId, dateISO)` export từ `apps/web/src/lib/repos/holidays.ts:125`,
  trả `makeupDate | null`.
- Badge warn mẫu cần tái dùng (giữ nguyên text, đúng classes hiện có):
  `apps/web/src/components/class-detail/class-sessions-section.tsx:374-378` —
  `Nghỉ lễ — Đã dời lịch`.
- Test suite của surface này: `apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx`
  (jsdom, harness `renderWithKernel` + `startKernelServer` + `snapshotFixture`
  từ `@/test/kernel-harness`; fixture `classRow`/`studentRow`/`enrollmentRow`/
  `lessonRow`/`syllabusRow` cũng từ harness). Riêng `sessionRow()` và
  `openSessionsTab()` là helper **file-local trong chính test file** (dòng
  ~118-133) — tái dùng tại chỗ, KHÔNG import từ harness. Fake time:
  `MONDAY = 2026-10-12` đã set trong `beforeEach`.

### Task 1.1 — Test đỏ: bucket manual 0-row có shift hiện badge, vắng «Sắp tới»

- Goal: Test A FAIL vì behavior chưa tồn tại (badge chưa render); Test
  B/C/D/E pin regression, pass ngay từ đầu.
- Target files: `apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx`
  (thêm `describe` mới cuối file; tái dùng fixture từ `@/test/kernel-harness`
  và helper file-local `sessionRow`/`openSessionsTab` ngay trong file).
- Steps:
  1. Helper `manualShiftedClass(overrides)` dựng snapshot fixture:
     - `classes: [classRow({ id: "cl-1", name: "IELTS Writing",
       schedulingMode: "manual", schedule: '{"days":[1],"start":"19:00","end":"20:30"}',
       startDate: TODAY, sessionsTotal: 2, syllabusId: "sy-c" })]`
     - `syllabi: [syllabusRow({ id: "sy-c", name: "Writing (bản lớp)",
       classId: "cl-1", sourceTemplateId: "sy-t" })]`
     - `classSessions: [ { id: "cs-1", classId: "cl-1", date: TODAY,
       time: "19:00", dur: 90, topic: "", zoom: "" }, { id: "cs-2",
       classId: "cl-1", date: NEXT_WEEK, time: "19:00", dur: 90,
       topic: "", zoom: "" } ]`
     - `lessons: []`, `students: []`, `enrollments: []`
     - `holidayShifts: [ { classId: "cl-1", originalDate: TODAY,
       makeupDate: "2026-12-21" } ]`
  2. Test A («manual 0-row có shift trùng ngày hiện badge Đã dời»):
     `server = startKernelServer(manualShiftedClass()); await
     openSessionsTab();` assert `within(sessionRow("12/10")).getByText("Nghỉ
     lễ — Đã dời lịch")` tồn tại; assert
     `within(sessionRow("12/10")).queryByText("Sắp tới")` là `null`; assert
     `within(sessionRow("19/10")).getByText("Sắp tới")` tồn tại (bucket khác
     không shift giữ nguyên).
  3. Test B («bucket có lesson row holiday giữ badge cũ»): variant fixture với
     `lessons: [lessonRow({ id: "les-hol", day: 1, date: TODAY, status:
     "holiday", type: "1:1" })]` (1 enrollment + student như `mondayClass`
     hiện có) và `holidayShifts` như trên; assert row 12/10 có text
     `Nghỉ lễ — Đã dời lịch` và KHÔNG có bản render thứ hai của badge nào
     trong cùng row (badge đến từ nhánh `status === "holiday"` cũ).
  4. Test C («lớp auto giữ «Dự kiến», flag không lộ»): variant fixture auto
     (`schedulingMode` bỏ hẳn — undefined, `lessons: []`, không `classSessions`,
     `holidayShifts` như Test A); assert row 12/10 chứa text `Dự kiến` và
     `within(row).queryByText("Nghỉ lễ — Đã dời lịch")` là `null` — pin
     precedence của nhánh `isProjected` trong chuỗi ternary chung.
  5. Test D («shift của lớp khác không badge chéo»): fixture như Test A nhưng
     `holidayShifts: [{ classId: "cl-2", originalDate: TODAY, makeupDate:
     "2026-12-21" }]` (không có lớp cl-2 trong fixture); assert row 12/10
     vẫn `Sắp tới`, không badge — pin filter `classId` trong
     `makeupDateForShift`.
  6. Test E («deploy skew: thiếu holidayShifts»): fixture như Test A nhưng
     bỏ `holidayShifts` (undefined); assert row 12/10 vẫn `Sắp tới` — pin
     default `[]` an toàn với server cũ.
  7. Chạy focus: `pnpm --filter web exec vitest run
     'src/routes/_auth/classes/$classId.sessions.test.tsx'` (NHỚ NHÁY ĐƠN —
     `$classId` không nháy bị shell xóa thành chuỗi rống).
- Success criteria: Test A fail ở assertion `getByText("Nghỉ lễ — Đã dời
  lịch")` (badge chưa tồn tại). Test B/C/D/E PASS ngay từ đầu — chúng pin
  hành vi hiện tại (regression gates), không phải red test.
- Verify: command ở bước 7 exit ≠ 0 và output có đúng 1 test fail là Test A
  với assertion `Unable to find an element with the text: Nghỉ lễ — Đã dời
  lịch`; Test B/C/D/E pass. Exit 0 toàn bộ = sai (test A không đỏ).

### Task 1.2 — Thread `holidayShifts` qua route → component

- Goal: `ClassSessionsSection` nhận được mảng shift của org qua prop mới.
- Target files:
  - `apps/web/src/components/class-detail/class-sessions-section.tsx`
    (component `ClassSessionsSection`, phần props destructuring + type).
  - `apps/web/src/routes/_auth/classes/$classId.tsx` (render site dòng ~358).
- Steps:
  1. Trong `class-sessions-section.tsx`: import `makeupDateForShift` từ
     `@/lib/repos/holidays`; import type `KernelHolidayShiftRow` từ
     `@teacher-os/api/contracts` (NGUỒN ĐÚNG — `@/lib/mock-data` chỉ import
     type này, không re-export; precedent
     `apps/web/src/components/schedule/holiday-undo-dialog.tsx:12-15`).
  2. Thêm prop optional `holidayShifts?: KernelHolidayShiftRow[]` (default
     `[]` khi destructuring — legacy caller/test không truyền vẫn chạy).
  3. Trong `$classId.tsx` render `<ClassSessionsSection …>`: thêm
     `holidayShifts={data.holidayShifts}`. Nếu `tsc` báo field optional thì
     dùng `data.holidayShifts ?? []` (KernelSlice thường đã non-optional —
     xem `apps/web/src/lib/repos/kernel.ts:382-384`).
- Success criteria: `tsc --noEmit` không lỗi prop mới; behavior chưa đổi.
- Verify: `pnpm --filter web check-types` exit 0.

### Task 1.3 — Derive flag + render badge thay thế nhánh «Sắp tới»

- Goal: bucket 0-row có shift trùng ngày render badge warn «Nghỉ lễ — Đã dời
  lịch» thay «Sắp tới»/AttendanceSummary; mọi nhánh khác giữ nguyên.
- Target files: `apps/web/src/components/class-detail/class-sessions-section.tsx`
  (trong `sessions.map((s) => {…})`, trước `return` của `li`, và chuỗi
  ternary badge ~`:367-386`).
- Steps:
  1. Trong map body tính: `const shiftedAway =
     s.rows.length === 0 && makeupDateForShift({ holidayShifts }, cls.id,
     s.dateISO) !== null;`
  2. Chèn 1 nhánh vào chuỗi ternary badge NGAY SAU nhánh
     `status === "holiday"` và TRƯỚC nhánh `status === "completed" || isPast …`:
     `: shiftedAway ? (<span className="inline-flex shrink-0 items-center
     rounded-md border border-warn/50 bg-warn-soft px-1.5 py-0.5 font-medium
     text-warn text-xs">Nghỉ lễ — Đã dời lịch</span>)` — copy đúng classes
     của badge mẫu `:374-378`, không thêm icon/text khác. Ghi chú: bucket
     0-row hôm nay CHỈ có thể rơi vào nhánh «Sắp tới» cuối (AttendanceSummary
     không với tới được — `isPast` đòi `attendees.length > 0`, tally đòi
     rows); vị trí chèn sau nhánh `holiday` là style safety, không phải để
     cứu AttendanceSummary.
  3. KHÔNG đổi: `isProjected` (đứng trước), «Đã hủy», AttendanceSummary khi
     có rows, nút «Tài liệu», `sessionStatus`.
- Success criteria: Test A (Task 1.1) chuyển xanh; Test B/C/D/E vẫn xanh;
  toàn bộ suite web xanh.
- Verify: `pnpm --filter web exec vitest run
  'src/routes/_auth/classes/$classId.sessions.test.tsx'` exit 0; sau đó
  `pnpm --filter web test` exit 0.

### Task 1.4 — Gates repo

- Goal: quality gates local pass.
- Target files: none (read-only gates; sửa format nếu biome báo).
- Steps:
  1. `pnpm check` — biome check **read-only, quét cả repo** (root
     `package.json`: `"check": "biome check ."`); nó KHÔNG tự sửa file. Nếu
     báo lỗi format/lint ở file plan này đụng tới: chạy
     `pnpm check:fix` (=`biome check --write .`), chạy lại `pnpm check`, rồi
     chạy lại test focus của Task 1.3. Lỗi biome ở file KHÔNG thuộc branch
     này: báo cáo, đừng mổ nó.
  2. `pnpm check-types`.
- Success criteria: cả hai exit 0.
- Verify: output kết thúc không có error; exit code 0 cho từng lệnh.

## Verification phase (chạy 1 lần cuối sau khi xong mọi task)

```
pnpm --filter web exec vitest run 'src/routes/_auth/classes/$classId.sessions.test.tsx'
pnpm --filter web test
pnpm check
pnpm check-types
```

Pass condition: cả 4 lệnh exit 0.
