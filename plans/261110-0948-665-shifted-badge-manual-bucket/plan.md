---
title: "Web: badge «Đã dời» cho bucket manual 0 lesson có shift row (#665)"
description: "Bucket manual không có lesson row nhưng ngày gốc đã bị dời lịch lễ hiển thị badge warn «Nghỉ lễ — Đã dời lịch» thay vì «Sắp tới»."
status: completed
priority: P2
effort: 2h
issue: 665
branch: vinh19410/feat/665-holiday-shifted-badge-manual-bucket
tags: [feature, frontend]
blockedBy: []
blocks: []
created: 2026-11-10
---

# Plan: badge «Đã dời» cho bucket manual 0 lesson (#665)

Tách từ #662 (red-team finding 6). Bucket manual có `class_sessions` row nhưng
**0 lesson row** tại ngày gốc `originalDate` của một `holiday_session_shift`
hiện đang render như buổi "Sắp tới" thường — teacher không biết buổi thật đã
dời sang ngày bù. Fix thuần web: thread `holidayShifts` (đã có sẵn trong kernel
snapshot) qua route → `ClassSessionsSection`, derive flag mới, render badge warn
sẵn có.

## Phát hiện then chốt (investigation 2026-11-10)

**Server KHÔNG cần sửa.** Hướng làm #1 của issue («đưa holiday_session_shift
rows vào payload») đã được TOS-11 thỏa từ trước:

- `apps/server/src/routes/snapshot.ts:857-862` — kernel snapshot đã gồm
  `holidayShifts: {holidayId, classId, originalDate, makeupDate}` toàn org.
- `apps/web/src/lib/repos/kernel.ts:382-384` — web state đã parse
  `holidayShifts` (default `[]` khi deploy skew), và `:574-577` giữ key optional
  trên wire để không trắng workspace.
- `apps/web/src/lib/repos/holidays.ts:125-135` — helper thuần
  `makeupDateForShift(snapshot, classId, dateISO)` đã export, lookup đúng cặp
  `(classId, originalDate)`.
- `apps/web/src/lib/data-provider.tsx:45-46` — `useData().data: KernelSlice`
  đã mang `holidayShifts` tới route `_auth/classes/$classId.tsx`.

Do đó phạm vi thực tế = «Hướng làm» #2 + #3 + #4 của issue (thread + derive +
render + test). Không mở `sessionStatus` (`apps/web/src/lib/class-sessions.ts:461`,
11 call sites / 6 files) đúng yêu cầu issue.

## Cơ chế hiện tại (bằng chứng đọc code)

- `buildClassSessions` nhánh manual (`apps/web/src/lib/class-sessions.ts:218-262`):
  `classSessions` sort theo date, bucket gom lesson rows theo `(classId, date)`.
  Bucket không có lesson row nào → `rows: []`.
- `sessionStatus` v2 (`class-sessions.ts:461-483`): `rows.length === 0` →
  luôn `"upcoming"` → component render nhánh cuối chuỗi ternary «Sắp tới».
- Chuỗi render badge (`apps/web/src/components/class-detail/class-sessions-section.tsx:367-386`):
  `isProjected ? "Dự kiến" : cancelled ? "Đã hủy" : holiday ? badge warn "Nghỉ
  lễ — Đã dời lịch" : completed|isPast ? AttendanceSummary : "Sắp tới"`.
  Bucket 0-row hôm nay **chỉ** rơi vào nhánh «Sắp tới» cuối: `status` luôn
  `"upcoming"` (mọi nhánh khác đòi `rows.length > 0`), `isPast` đòi
  `attendees.length > 0` (= `sessionStudents([]) = []`), nhánh tally đòi
  `markedCount + absentCount > 0`. Do đó flag mới thực chất **thay thế nhánh
  «Sắp tới»**; vị trí chèn sau nhánh `holiday` (giữ badge cũ cho bucket có
  lesson row `holiday`) là để cố ý đặt cạnh badge cùng ngữ nghĩa, không phải
  vì AttendanceSummary có thể lộ.

## Phases

| Phase | File | Nội dung |
|---|---|---|
| 01 | [phase-01-shifted-badge.md](./phase-01-shifted-badge.md) | Test-first: red test → thread prop → derive flag → badge → green + gates |

## Acceptance criteria (từ issue #665)

- [x] Bucket manual 0 lesson có shift row trùng ngày hiển thị badge warn
      «Nghỉ lễ — Đã dời lịch» (thỏa «badge Đã dời»), **không** kèm «Sắp tới».
      — verify: `$classId.sessions.test.tsx` Test A (22/22 pass).
- [x] Bucket có lesson row `holiday` giữ nguyên badge cũ qua
      `sessionStatus === "holiday"` (regression). — verify: Test B
      (`getAllByText` length === 1).
- [x] `pnpm check` (3 file touched sạch; 3 error/105 warning còn lại là
      baseline develop ở file không đụng), `pnpm check-types` (12/12 task),
      web suite pass (192 file / 2016 test).

## Scope lock / non-goals

- KHÔNG sửa server (`snapshot.ts`, `holidays.ts`, `kernel.ts`).
- KHÔNG mở rộng signature `sessionStatus` hay đổi semantics của nó.
- KHÔNG đụng nhãn «Dự kiến» của projection lớp auto, nhãn «Đã hủy», và
  AttendanceSummary của bucket có rows.
- KHÔNG đổi nút «Tài liệu» của bucket flagged (việc chặn attach là phần server
  #662; ẩn/hiện nút này không thuộc AC của #665).
- KHÔNG thêm fetch/API mới.

## Rủi ro

- Bucket tại ngày bù (`makeupDate`): với lớp manual **0 enrollment**, apply
  shift KHÔNG sinh bucket nào ở ngày bù — `shiftStatements`
  (`apps/server/src/routes/holidays.ts:317-368`) chỉ mark lesson
  `originalDate` → `holiday` và clone **lesson** rows sang `makeupDate`,
  không insert `class_session`; không có lesson nào để clone (0 enrollment)
  ⇒ danh sách chỉ có bucket ngày gốc. Badge «Đã dời» trên ngày gốc là toàn bộ
  deliverable của #665 (hướng làm #3 chỉ định đúng text badge này, không yêu
  cầu hiển thị ngày bù — ngày bù xem được ở `/schedule` qua nhãn tuần sẵn có).
  Với lớp có enrollment, lesson rows clone sang `makeupDate` + `class_sessions`
  có sẵn ⇒ bucket bù hiện «Sắp tới» như buổi dạy thật.
- Deploy skew server cũ không gửi `holidayShifts`: web default `[]` → flag
  không bao giờ bật, UI trở lại hành vi hôm nay (an toàn) — pinned bởi Test E.
- Lớp auto 0-lesson (projection): `isProjected` render «Dự kiến» trước trong
  chuỗi ternary → flag không thể lộ ra (hành vi giữ nguyên) — pinned bởi
  Test C. Filter `classId` chống badge chéo lớp — pinned bởi Test D.
- Shift-vs-cancel: `holiday_session_shift` và `holiday_session_cancel` là hai
  bảng cho hai mode **độc lập** của một kỳ nghỉ (một holiday = một mode; chỉ
  có POST apply + DELETE hoàn tác xóa theo `holidayId`, không có edit path đổi
  mode; `holiday_session_cancel` còn unique index `(class_id, date)`) — hai
  collection không thể cùng claim một `(classId, originalDate)` của cùng kỳ
  nghỉ, nên derive chỉ cần đọc `holidayShifts` (không cần precedence check
  `holidayCancels`).

## Validation Log

### Verification Results (2026-11-10, tier Light — 1 phase, Fact Checker)

- Claims checked: 10 | Verified: 10 | Failed: 0 | Unverified: 0
- Claims + evidence:
  1. `snapshot.ts:857-862` gồm `holidayShifts {holidayId, classId, originalDate, makeupDate}` — VERIFIED (grep kernel snapshot build).
  2. `repos/kernel.ts:382-384` web parse `holidayShifts ?? []` — VERIFIED (grep).
  3. `repos/kernel.ts:574-577` key optional-on-wire tránh trắng workspace — VERIFIED (grep: list keys + comment deploy skew).
  4. `repos/holidays.ts:125-135` `makeupDateForShift(snapshot, classId, dateISO)` export thuần — VERIFIED (grep, đúng signature).
  5. `class-sessions.ts` nhánh manual `buildClassSessions` bucket gom rows theo date, bucket 0-row có thể tồn tại — VERIFIED (read :218-262).
  6. `sessionStatus` v2: `rows.length === 0` → `"upcoming"` — VERIFIED (read :461-483).
  7. Component chuỗi ternary badge `isProjected → cancelled → holiday → completed|isPast|tally → Sắp tới` tại `:367-386` — VERIFIED (read).
  8. Route `_auth/classes/$classId.tsx:358` render `<ClassSessionsSection>`, `data` từ `useData()` (`data-provider.tsx:46` `data: KernelSlice`) — VERIFIED (read :93-173, :358-372).
  9. Test harness exports `snapshotFixture/classRow/lessonRow(… status)/startKernelServer/renderWithKernel` từ `@/test/kernel-harness` — VERIFIED (grep).
  10. `$classId.sessions.test.tsx` có `sessionRow()`, `openSessionsTab()`, hằng `TODAY/NEXT_WEEK` (12/10, 19/10) — VERIFIED (read :27-178).
- `[UNVERIFIED]` tags: none.
- Decision (self-adjudicated, autonomous run): AC yêu cầu «badge Đã dời»,
  hướng làm #3 chỉ định tái dùng badge warn «Nghỉ lễ — Đã dời lịch» sẵn có —
  hai yêu cầu tương thích, dùng text badge hiện có. Không có decision point
  nào cần hỏi user.

## Red Team Review

### Session — 2026-11-10

**Reviewers:** 2 hostile reviewers song song (Security Adversary, Assumption
Destroyer), tier Light (1 phase) → verification role Fact Checker cho cả hai.
**Findings:** 13 raw → dedupe → 10 unique (0 Critical, 2 High, 8 Medium).
**Disposition:** 7 Accept (đã áp), 3 Reject.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Import `KernelHolidayShiftRow` từ `@/lib/mock-data` — module không export type này (chỉ import dùng); nguồn đúng `@teacher-os/api/contracts` (precedent `holiday-undo-dialog.tsx:12-15`) | High | Accept | Phase 01 Task 1.2 step 1 |
| 2 | `$classId` không nháy đơn trong mọi Verify command → shell expand rỗng, gate không thể đạt | High | Accept | Task 1.1 step 7, Task 1.3 Verify, Verification phase |
| 3 | Claim sai: bucket 0-row không bao giờ render AttendanceSummary (`isPast` đòi attendees, tally đòi rows) — flag chỉ thay nhánh «Sắp tới» | Medium | Accept | plan.md «Cơ chế hiện tại»; Task 1.3 step 2 note |
| 4 | Nút «Tài liệu» vẫn hiện trên bucket flagged → 409 trap | Medium | Reject — scope #665 là badge (hướng làm #3); nút đã tồn tại trên bucket này từ trước, #665 không làm tệ hơn; chặn attach server-side là việc #662 (OPEN, ready to ship beta). Ghi follow-up trên issue | — |
| 5 | Thiếu test pin filter `classId` và default `[]` deploy-skew | Medium | Accept | Task 1.1 thêm Test D, Test E |
| 6 | `pnpm check` là read-only `biome check .`, không phải `--write`; recovery path sai | Medium | Accept | Task 1.4 step 1 (`check:fix`) |
| 7 | Invariant shift-vs-cancel (cùng `(classId, originalDate)` ở 2 collection) chưa verify | Medium | Reject — một holiday chỉ có một mode; chỉ POST apply + DELETE hoàn tác theo `holidayId`, không có edit path đổi mode; `holiday_session_cancel` unique index `(class_id, date)` — thêm risk note | plan.md «Rủi ro» |
| 8 | Manual 0 enrollment: apply KHÔNG sinh bucket ở ngày bù (server chỉ clone lesson rows, không insert `class_session`); risk note cũ sai | Medium | Accept (sửa risk bullet). Reject đề xuất thêm «Đã dời sang dd/MM» vào badge — ngoài AC + hướng làm #3 của issue | plan.md «Rủi ro» |
| 9 | Precedence «Dự kiến» của lớp auto chỉ được argued, chưa được pin test | Medium | Accept | Task 1.1 thêm Test C |
| 10 | Attribution sai: `sessionRow`/`openSessionsTab` là file-local của test file, không phải harness exports | Medium | Accept | Phase 01 «Bối cảnh»; Task 1.1 Target files |

### Whole-Plan Consistency Sweep

Sau khi áp các finding: re-read `plan.md` + `phase-01-shifted-badge.md`.

- Claim #3 (cơ chế): bản cũ «AttendanceSummary rỗng/nhầm ngữ cảnh» đã thay ở
  CẢ plan.md («Cơ chế hiện tại») và Task 1.3 step 2 — không còn bản sao cũ.
- Claim #8 (ngày bù): risk bullet 1 viết lại; không còn chỗ nào khẳng định
  «bucket bù giữ Sắp tới» cho scenario 0 enrollment.
- Verify commands: thống nhất nháy đơn quanh
  `'src/routes/_auth/classes/$classId.sessions.test.tsx'` ở 3 chỗ.
- Test inventory: Test A (red) + B/C/D/E (regression) được tham chiếu nhất
  quán ở Task 1.1 success criteria, Task 1.3 success criteria, và Rủi ro
  (pinned bởi Test C/D/E).
- AC list giữ nguyên 3 mục của issue #665; scope lock giữ nguyên (nút
  «Tài liệu» vẫn non-goal theo finding #4 rejected).
- Không còn unresolved contradiction.
