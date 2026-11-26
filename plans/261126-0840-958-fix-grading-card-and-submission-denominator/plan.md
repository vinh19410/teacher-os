---
title: "Sửa thẻ Chấm bài gây hiểu lầm và mẫu số tỉ lệ nộp bài lớp (#958)"
description: "Sửa câu chữ zero-state của thẻ Chấm bài (và Hero summary) để phản ánh đúng phạm vi bài quá hạn chấm > 24h đồng thời nổi bật bài quá hạn chưa nộp, và khắc phục lỗi trôi mẫu số 0/1 thay vì 0/2 bằng target_scope, tự động bù target khi kích hoạt học viên, migration dữ liệu bảo thủ 0095+0096, cảnh báo học viên đang mời và nút Giao bổ sung."
status: pending
priority: P1
effort: "5h"
issue: 958
branch: vinh19410/th-ch-m-b-i-ho-n-t-t-h-m-nay-g-y-hi-u-l-m-khi-v
tags: [bug, ux-review, dashboard, assignments, backend, frontend]
created: 2026-11-26
---

# Plan: Sửa thẻ Chấm bài gây hiểu lầm và mẫu số tỉ lệ nộp bài lớp (#958)

## Overview

Khắc phục triệt để cả hai lỗi nghiệp vụ và trải nghiệm trong issue [#958](https://github.com/vinh19410/teacher-os/issues/958), tuân thủ tuyệt đối hệ token `DESIGN.md`, checklist `REVIEW.md` và toàn bộ hợp đồng API/E2E hiện hành:

1. **Thẻ «Chấm bài» và tóm tắt Hero trên `/teacher/dashboard`:**
   - Tách nhãn trạng thái 0 việc theo từng thẻ trong `apps/web/src/components/dashboard/reminder-cards.tsx`: giữ `"Đã hoàn tất hôm nay"` cho Thẻ 1 (`Điểm danh`, bảo toàn `daily-attendance.spec.ts:198`), đổi Thẻ 2 (`Chấm bài`) sang **`"Không còn bài quá hạn chấm"`** (phản ánh đúng phạm vi `> 24h` của heading `"Bài tập quá hạn chấm > 24h"`, tránh nói sai khi còn bài chờ chấm `< 24h` hoặc bài học viên chưa nộp), và đổi Thẻ 3 (`Học phí`) sang **`"Không có khoản đến hạn"`**.
   - Bổ sung selector thuần `overdueUnsubmittedSummary(students, lessons, now, classes, classAssignments, assignments)` trong `apps/web/src/lib/dashboard-from-kernel.ts` (dùng chung chính xác bộ lọc `students`, predicate quá hạn, loại trừ lớp `paused` và guard `submittedAt != null || attemptId != null` với `atRiskRows`) để tính số bài quá hạn chưa nộp và số học viên liên quan ngay từ kernel snapshot — **0 thay đổi wire contract** `GET /api/dashboard/reminders`.
   - Khi có bài quá hạn chưa nộp (`targets > 0`), hiển thị dải cảnh báo màu `--warn` (`AlertTriangle` có `shrink-0 mt-0.5`, non-interactive bên trong stretched `<Link>` của Thẻ 2, nối `aria-describedby` vào `<Link>`): `"Còn N bài quá hạn chưa nộp (M học viên) — xem ở Cần kiểm tra"`, đồng thời giữ nền `bg-card` (không hạ mờ sang `bg-muted`) để giáo viên không hiểu lầm rằng mọi bài tập đã ổn thỏa.
   - Sửa dòng tóm tắt Hero (`apps/web/src/routes/_auth/dashboard.tsx`): khi `openTasks === 0 && risk.length > 0`, hiển thị **`"Còn N học viên cần kiểm tra."`** thay vì `"Mọi việc hôm nay đã xong."`.

2. **Mẫu số tỉ lệ nộp bài (`0/1` → `0/2`) khi lớp có học viên kích hoạt muộn / đang mời:**
   - Thêm cột `target_scope` (`"class" | "selected"`, mặc định `"class"`) trên `class_assignment` (`packages/db/src/schema/class-assignment.ts`) theo chuẩn tách DDL/DML của repo (`0085`+`0087`):
     - `0095_class_assignment_target_scope.sql` (+ `meta/0095_snapshot.json`, `when > 1795650000000`): thuần DDL `ALTER TABLE class_assignment ADD target_scope text DEFAULT 'class' NOT NULL;`.
     - `0096_backfill_class_assignment_targets.sql` (+ `meta/0096_snapshot.json`, `when > entry95.when`): thuần DML idempotent gồm (a) `UPDATE` hạ `target_scope = 'selected'` cho các lượt giao chọn lọc lịch sử (có học viên đã active từ trước `ca.created_at` bị bỏ qua), và (b) `INSERT OR IGNORE` bù bảo thủ `class_assignment_target` cho enrollment `active` của lớp `active` (loại `demo-student:%`, INF-03) được ghi danh hoặc kích hoạt (`sp.created_at`) sau lúc giao bài nhưng trước hạn nộp (`<= deadlineMs`).
   - Bổ sung hàm `backfillClassAssignmentTargetsForStudent` (có `INNER JOIN classTable` lọc `status = 'active'` và nhận `now` từ `activateEnrollment(..., now)` / `deps.now`) chỉ gọi khi kích hoạt thật từ `'invited' -> 'active'` (không gọi ở nhánh replay `existingEnrollment.status === "active"` để tránh lỗ hổng học viên tự gán bài và tránh ghi trên lớp `paused`), đồng thời đóng kín cửa sổ TOCTOU trong `POST /api/classes/:id/assignments` (không tin mù `input.targetScope = "class"` khi `input.studentIds.length < roster.size`).
   - Thêm endpoint `POST /api/classes/:id/assignments/:assignmentId/targets` (`apps/server/src/routes/kernel.ts`) có đầy đủ kiểm tra `409 CLASS_PAUSED` (kèm atomic SQL guard), RBAC chặn vai trò `ta` (`canPublishGrade`), `db.batch` nguyên tử với `.returning({ studentId })` tránh quá 100 bind D1 và tránh race đếm `added`, phát `assignmentPublishedEvents` chỉ cho học viên vừa thêm.
   - Cập nhật UI `AssignClassPromptModal` gửi `targetScope` và hiển thị cảnh báo `--warn` khi lớp còn học viên `invited`, và cập nhật `ClassAssignmentsTab` hiển thị rõ phạm vi giao `"Giao X/Y HV"` khi `missingActiveStudentIds.length > 0` kèm thanh **"Giao bổ sung"** (cắt lô tối đa 100 HV, ẩn khi lớp `paused` hoặc vai trò không có quyền giao bài).

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - Dashboard (`apps/web/src/lib/dashboard-from-kernel.ts`, `apps/web/src/components/dashboard/reminder-cards.tsx`, `apps/web/src/routes/_auth/dashboard.tsx` + unit tests): nhãn zero-state theo từng thẻ, selector `overdueUnsubmittedSummary` (có tham số `students`), cảnh báo quá hạn chưa nộp trong Thẻ 2 (nối `aria-describedby`), Hero summary kiểm `risk.length > 0`.
  - Schema, Migration & Contracts (`packages/db/src/schema/class-assignment.ts`, `packages/db/src/migrations/0095_class_assignment_target_scope.sql`, `0096_backfill_class_assignment_targets.sql`, `meta/0095_snapshot.json`, `meta/0096_snapshot.json`, `meta/_journal.json`, `packages/api/src/contracts.ts`, migration test): `target_scope`, tách 2 migration DDL + DML idempotent kèm snapshot chain, contract `targetScope` (optional) và `classAssignmentAddTargetsSchema`.
  - Server (`apps/server/src/routes/enrollment-activation.ts`, `apps/server/src/routes/kernel.ts`, `apps/server/src/routes/student.ts`, `apps/server/src/routes/snapshot.ts` + tests): `backfillClassAssignmentTargetsForStudent`, `activateEnrollment` nhận `now`, đóng cửa sổ TOCTOU `POST /classes/:id/assignments`, endpoint `POST /api/classes/:id/assignments/:assignmentId/targets` có `409 CLASS_PAUSED` + RBAC `canPublishGrade` + atomic `db.batch` `.returning()`.
  - Web Assignments (`apps/web/src/lib/mock-data.ts`, `apps/web/src/lib/repos/class-assignments.ts`, `apps/web/src/lib/repos/class-assignments.test.ts`, `apps/web/src/lib/data-actions.ts`, `apps/web/src/lib/data-store-reducer.ts`, `apps/web/src/lib/repos/kernel.ts`, `apps/web/src/components/classes/assign-class-prompt-modal.tsx`, `apps/web/src/components/classes/class-assignments-tab.tsx`, `apps/web/src/routes/_auth/classes/$classId.tsx` + tests): truyền `targetScope`, `parseWriteEnvelope` hỗ trợ `added`, cảnh báo `invited`, hiển thị `"Giao X/Y HV"` và nút `"Giao bổ sung"` (cắt lô ≤ 100 HV, ẩn cho `paused` / `!canPublishGrade`).
  - Verification & POT: unit/integration tests, targeted E2E (`dashboard-reminders.spec.ts`, `daily-attendance.spec.ts`, `class-assign.spec.ts`), `pnpm design:compare --screens t-dashboard --side app --force`, và ảnh POT 3 viewport Light/Dark trong `plans/reports/`.
- **Explicit Non-Goals:**
  - Không thay đổi wire contract hoặc ngưỡng `> 24h` của `GET /api/dashboard/reminders` (giữ nguyên `.strict()` và `dashboard-reminders.spec.ts:121`).
  - Không thay đổi `backfillStudyPackTargetsForStudent` (`apps/server/src/lib/study-pack-assign.ts:573`) hay hành vi `targetsTotal` của Study Pack (`#533` / `#572`).
  - Không đổi mặc định `activateNow = false` của `EnrollStudentModal` cho học viên có sẵn (`apps/web/src/components/modals/enroll-student-modal.test.tsx:44`) và không tự giao bài cho enrollment `invited`.
  - Không hiển thị mẫu số giả `cls.studentIds.length` trên frontend khi DB chưa có dòng `class_assignment_target` thật (tránh vỡ quyền mở bài `404` trên Student Portal và lệch danh sách học viên bên trong accordion).
  - Không tự động bù bài đã quá hạn (`dueAt <= now`) lên học viên mới kích hoạt trong tương lai (tránh gắn cờ quá hạn oan; bài cũ quá hạn xử lý qua migration tiền-hạn `0096` và nút `"Giao bổ sung"`).
  - Không chạy full E2E suite ở local (`AGENTS.md`).

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Thẻ Chấm bài và Hero trên `/teacher/dashboard` phản ánh chính xác phạm vi chờ chấm `> 24h` và nổi bật bài quá hạn chưa nộp mà không vỡ hợp đồng E2E | P1 |
| 2 | Học viên kích hoạt sau tự động nhận bài giao cả lớp còn hạn (`0/1` → `0/2`), dữ liệu tiền-hạn được bù an toàn qua migration 0095+0096 và giáo viên có nút `"Giao bổ sung"` cho bài thiếu học viên | P1 |
| 3 | Vượt qua toàn bộ gate tĩnh/unit, targeted E2E, `pnpm design:compare` và hoàn thiện ảnh POT 3 viewport Light/Dark | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Dashboard Grading Card, Hero Copy & Overdue-Unsubmitted Highlight (TDD)](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Assignment Target Scope, Activation Backfill, Migration & Supplemental Sync (TDD)](./phase-02-assignment-target-scope-backfill-and-sync.md) | Pending |
| 3 | [Phase 3: Verification Gates, Targeted E2E, Design Compare & Visual POT](./phase-03-verification-e2e-and-visual-pot.md) | Pending |

## Success Criteria

- [ ] Thẻ 2 (`reminder-card-grading`) không bao giờ hiển thị `"Đã hoàn tất hôm nay"`; khi `overdueGrading.count === 0` hiển thị `"Không còn bài quá hạn chấm"`, và khi `overdueUnsubmitted.targets > 0` hiển thị dòng cảnh báo màu `--warn` (`Còn N bài quá hạn chưa nộp (M học viên) — xem ở Cần kiểm tra`, nối `aria-describedby` vào `<Link>`) trên nền `bg-card` không bị hạ mờ.
- [ ] Thẻ 1 (`reminder-card-attendance`) giữ nguyên `"Đã hoàn tất hôm nay"` (`daily-attendance.spec.ts:198` pass không cần sửa); Thẻ 3 (`reminder-card-tuition`) hiển thị `"Không có khoản đến hạn"` khi `students === 0`.
- [ ] Hero summary trên `/teacher/dashboard` hiển thị `"Còn N học viên cần kiểm tra."` khi `openTasks === 0 && risk.length > 0` và chỉ hiển thị `"Mọi việc hôm nay đã xong."` khi `openTasks === 0 && risk.length === 0`; `overdueUnsubmittedSummary` lọc theo `students` khớp 100% với `atRiskRows`.
- [ ] Migration `0095_class_assignment_target_scope.sql` (DDL) + `0096_backfill_class_assignment_targets.sql` (DML idempotent) có đầy đủ `meta/0095_snapshot.json` và `meta/0096_snapshot.json` nối liền `prevId` và `when` đơn điệu tăng (`study-pack-migration.test.ts` pass); đánh dấu `'selected'` cho lượt giao chọn lọc lịch sử và bù bảo thủ target cho học viên `active` thuộc lớp `active` kích hoạt trước hạn nộp (`sp.created_at <= deadlineMs`, không `demo-student:%`).
- [ ] `activateEnrollment(db, orgId, enrollmentId, now)` nhận `deps.now`, chỉ chạy `backfillClassAssignmentTargetsForStudent` (có join `classTable.status = 'active'`) khi kích hoạt thật từ `'invited' -> 'active'` (không chạy trên replay `active`), giúp mẫu số tự động chuyển `0/1` → `0/2` và học viên thứ 2 mở/nộp được bài trên Student Portal (`200`).
- [ ] `POST /api/classes/:id/assignments` không tin mù `targetScope: "class"` từ client và đóng cửa sổ TOCTOU với `activateEnrollment`; `POST /api/classes/:id/assignments/:assignmentId/targets` cưỡng chế `409 CLASS_PAUSED` (kèm atomic SQL guard), RBAC `canPublishGrade` (chặn `ta` `403`), atomic `db.batch` `.returning()`, phát `assignmentPublishedEvents` chỉ cho học viên vừa thêm, và hoạt động qua nút `"Giao bổ sung"` (cắt lô ≤ 100 HV) kèm chỉ báo `"Giao X/Y HV"` trên `ClassAssignmentsTab`.
- [ ] `AssignClassPromptModal` gửi `targetScope` (`"class"` khi chọn đủ toàn bộ học viên đang học và ≤ 100, `"selected"` khi chọn một phần) và hiển thị nhắc nhẹ khi lớp còn học viên `invited`.
- [ ] `pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter @teacher-os/api test`, `pnpm --filter server test`, `pnpm --filter web test`, targeted E2E (`dashboard-reminders.spec.ts`, `daily-attendance.spec.ts`, `class-assign.spec.ts`) và `pnpm design:compare --screens t-dashboard --side app --force` đều pass 100%; không tràn ngang ở `320px/375px/768px/1440px` Light & Dark; đủ 6 ảnh POT trong `plans/reports/` và không dính ảnh PNG lịch sử.

## Handover Note (`--advice`)

Kế hoạch này đạt chuẩn bàn giao (`advice-handover-plan.md`) cho executor model ở tầng thấp hơn: mỗi phase được phân rã thành các task tự chứa với đường dẫn file và symbol chính xác, điều kiện kiểm chứng TDD đỏ/xanh rõ ràng, lệnh `Verify` cơ học và khối `## Failure Protocol` bắt buộc dừng + hỏi `kongming` ngay khi bất kỳ bước kiểm chứng nào thất bại.

## Validation Log

### Session 1 — 2026-11-26
**Trigger:** Chốt adjudication 12 phát hiện Red-Team (3 reviewer song song có bằng chứng `file:line`) và 2 quyết định sản phẩm cho issue #958 trước khi bắt đầu triển khai.
**Questions asked:** 3 (gộp Red-Team user review + 2 quyết định Validation trong 1 lượt `ask_question`).

#### Questions & Answers
1. **[Red-Team Adjudication]** Xử lý 12 phát hiện Red-Team (4 Critical, 6 High, 2 Medium) có bằng chứng `file:line`.
   - Options: `(Recommended) Đồng ý áp dụng toàn bộ 12 phát hiện Red-Team vào kế hoạch rồi triển khai` | `Xem và duyệt chi tiết từng phát hiện trước khi áp dụng` | `Bỏ qua toàn bộ phát hiện Red-Team, giữ nguyên kế hoạch ban đầu`
   - **Answer:** `(Recommended) Đồng ý áp dụng toàn bộ 12 phát hiện Red-Team vào kế hoạch rồi triển khai`
   - **Rationale:** Toàn bộ 12 phát hiện đều là lỗi thật hoặc rủi ro tải trọng được chứng minh trực tiếp từ codebase (migration snapshot chain, SQLite duplicate column, auth bypass replay active, TOCTOU, 409 CLASS_PAUSED, RBAC `ta`, D1 bind limit, `students` filter, `deps.now`, `class-assignments.test.ts`, `pnpm check:fix`, ảnh E2E tracked).
2. **[Scope / Architecture]** Quy tắc sửa mẫu số `0/1` → `0/2` khi học viên thứ 2 kích hoạt muộn hoặc gia nhập lớp sau khi bài đã quá hạn (như GrammarI).
   - Options: `(Recommended) Tự động bù bài còn hạn (target_scope='class') khi kích hoạt + migration 0096 bù bảo thủ cho HV kích hoạt trước hạn + nút "Giao bổ sung" 1 chạm cho bài cũ quá hạn` | `Tự động bù cả bài đã quá hạn lên mọi HV kích hoạt sau (chấp nhận HV mới vào lớp giữa khóa bị hiện quá hạn ngay)`
   - **Answer:** `(Recommended) Tự động bù bài còn hạn (target_scope='class') khi kích hoạt + migration 0096 bù bảo thủ cho HV kích hoạt trước hạn + nút "Giao bổ sung" 1 chạm cho bài cũ quá hạn`
   - **Rationale:** Tránh gắn cờ quá hạn oan cho học viên mới vào lớp giữa khóa, đồng thời xử lý triệt để cả học viên đã kích hoạt trước hạn trên staging (qua migration 0096) lẫn bài đã quá hạn cần giao bù tay (qua `"Giao bổ sung"`).
3. **[Scope / UX]** Phạm vi hiển thị của Thẻ 2 «Chấm bài» trên `/teacher/dashboard`.
   - Options: `(Recommended) Giữ nguyên API /api/dashboard/reminders (> 24h), đổi nhãn Thẻ 2 sang "Không còn bài quá hạn chấm" + hiện cảnh báo amber "Còn N bài quá hạn chưa nộp (M học viên)" từ kernel snapshot + sửa Hero summary khi còn học viên Cần kiểm tra` | `Mở rộng API /api/dashboard/reminders đếm thêm bài chờ chấm < 24h và bài quá hạn chưa nộp gồm cả Study Pack (thay đổi contract .strict() và lệch phạm vi bảng Cần kiểm tra)`
   - **Answer:** `(Recommended) Giữ nguyên API /api/dashboard/reminders (> 24h), đổi nhãn Thẻ 2 sang "Không còn bài quá hạn chấm" + hiện cảnh báo amber "Còn N bài quá hạn chưa nộp (M học viên)" từ kernel snapshot + sửa Hero summary khi còn học viên Cần kiểm tra`
   - **Rationale:** Bảo toàn 100% wire contract `.strict()` của `/api/dashboard/reminders` và E2E `dashboard-reminders.spec.ts`, đồng bộ tuyệt đối với khối `"Cần kiểm tra"` bên dưới.

#### Confirmed Decisions
- Áp dụng trọn vẹn 12 phát hiện Red-Team vào `plan.md`, `phase-01`, `phase-02`, `phase-03`.
- Mẫu số nộp bài: tách migration `0095` (DDL) + `0096` (DML bảo thủ), auto-backfill bài thường còn hạn (`target_scope = 'class'`) khi kích hoạt thật `'invited' -> 'active'`, và nút `"Giao bổ sung"` cho bài thiếu học viên.
- Thẻ Chấm bài: giữ API `/api/dashboard/reminders` nguyên vẹn, đổi nhãn 0 việc sang `"Không còn bài quá hạn chấm"`, hiển thị cảnh báo amber bài quá hạn chưa nộp từ kernel snapshot và cập nhật Hero summary theo `risk.length > 0`.

#### Impact on Phases
- Phase 1: Bổ sung tham số `students` vào `overdueUnsubmittedSummary`, thêm `aria-describedby` + `shrink-0 mt-0.5` + `min-w-0` và copy `"Còn N bài quá hạn chưa nộp (M học viên) — xem ở Cần kiểm tra"` cho Thẻ 2.
- Phase 2: Tách 2 migration `0095`+`0096` kèm `meta/0095_snapshot.json` & `meta/0096_snapshot.json` (`when` đơn điệu tăng), thêm `UPDATE target_scope = 'selected'` + `sp.created_at <= deadlineMs` + join `class.status = 'active'` + lọc `demo-student:%`; truyền `now` vào `activateEnrollment` và bỏ backfill khỏi nhánh replay `active`; đóng TOCTOU ở `POST /classes/:id/assignments`; thêm `409 CLASS_PAUSED` + RBAC `canPublishGrade` + atomic `db.batch` `.returning()` cho `POST .../targets`; cập nhật `class-assignments.test.ts`, `parseWriteEnvelope`, cắt lô ≤ 100 HV, thống nhất prop `run` và nhãn `"Giao X/Y HV"`.
- Phase 3: Sửa `pnpm check:fix`, chọn thứ lớp khác hôm nay + positive Hero assertion + verify Student Portal `200` trong E2E, và khôi phục đủ ảnh `tos-6`/`tos-7`/`tos-8`/`design-v2`.

### Verification Results
- **Tier:** Standard (Fact Checker + Contract Verifier — chạy song song qua 3 reviewer độc lập)
- **Claims checked:** 22
- **Verified:** 13 | **Failed (now fixed in plan):** 9 | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-assignment-target-scope-backfill-and-sync.md`, `phase-03-verification-e2e-and-visual-pot.md`
- Decision deltas checked: 12
- Reconciled stale references: 12 (tách `0095`+`0096` & snapshots, `sp.created_at <= deadlineMs`, `UPDATE selected` & bỏ replay backfill, TOCTOU `POST /assignments`, `409 CLASS_PAUSED` + RBAC `ta`, atomic `db.batch` `.returning()` + slice 100 + `parseWriteEnvelope`, `students` filter + `aria-describedby`, `activateEnrollment(..., now)`, `class-assignments.test.ts` + prop `run`, `pnpm check:fix`, `tos-8`/`design-v2` screenshots + positive Hero E2E)
- Unresolved contradictions: 0

## Red Team Review

### Session 1 — 2026-11-26
**Reviewers:** 3 parallel fresh-context `code-reviewer` subagents (`Security Adversary`, `Assumption Destroyer`, `Failure Mode Analyst`) — Standard tier (Fact Checker + Contract Verifier).
**Findings:** 12 deduplicated (12 accepted, 0 rejected)
**Severity breakdown:** 4 Critical, 6 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | Thiếu `meta/0095_snapshot.json` (và `0096_snapshot.json`) + `when > 1795650000000` làm fail `study-pack-migration.test.ts:283-302` | Critical | Accept | `plan.md`, Phase 2 (Files, Task 2.1) |
| 2 | Gộp DDL + DML vào chung file `0095` làm crash SQLite (`duplicate column name`) khi re-run kiểm idempotency và mất khả năng retry D1 | Critical | Accept | `plan.md`, Phase 2 (Files, Task 2.1) |
| 3 | Migration thiếu `sp.created_at <= deadlineMs`, không hạ `'selected'` cho bài chọn lọc lịch sử (lỗ hổng học viên tự gán bài qua replay `accept`), thiếu join `class.status='active'` & lọc `demo-student:%` | Critical | Accept | `plan.md`, Phase 2 (Task 2.1, Task 2.2) |
| 4 | Race TOCTOU giữa `POST /classes/:id/assignments` và `activateEnrollment` + tin mù `input.targetScope="class"` từ client | Critical | Accept | `plan.md`, Phase 2 (Task 2.2) |
| 5 | Thiếu guard `409 CLASS_PAUSED` ở server cho `POST .../targets` và thiếu join `classTable.status='active'` + error boundary ở `activateEnrollment` | High | Accept | `plan.md`, Phase 2 (Task 2.2) |
| 6 | Thiếu kiểm tra RBAC (`canPublishGrade`, chặn `ta` `403`) trên `POST .../targets` và UI nút `"Giao bổ sung"` | High | Accept | `plan.md`, Phase 2 (Task 2.2, Task 2.3) |
| 7 | Giới hạn 100 bind D1, thiếu atomic `db.batch` `.returning()` cho `{ added }` & `targetScope`, `parseWriteEnvelope` bỏ `added`, và vỡ `400` với lớp > 100 HV thiếu | High | Accept | `plan.md`, Phase 2 (Task 2.2, Task 2.3) |
| 8 | `overdueUnsubmittedSummary` thiếu tham số `students` (lệch `atRiskRows` trên `demo-student:%`), thiếu `aria-describedby` và rõ đích điều hướng trên Thẻ 2 | High | Accept | `plan.md`, Phase 1 (Task 1.1, 1.2, 1.3) |
| 9 | `activateEnrollment` không nhận/truyền `deps.now` từ 4 caller (`kernel.ts`, `student.ts`) | High | Accept | `plan.md`, Phase 2 (Task 2.2) |
| 10 | Bỏ sót `class-assignments.test.ts` (exact `.toEqual`), sai công thức `"Giao X/Y HV"`, và mâu thuẫn prop `onAddTargets` vs `run` ở Task 2.3 | High | Accept | `plan.md`, Phase 2 (Files, Task 2.3) |
| 11 | Phase 3 Task 3.2 bỏ sót ảnh tracked `tos-8`/`design-v2`, kịch bản E2E Hero flaky vào T2/T4 & thiếu positive assertion + Student Portal check | Medium | Accept | `plan.md`, Phase 3 (Task 3.2, 3.3) |
| 12 | Phase 3 Task 3.1 viết nhầm `pnpm check` làm lệnh auto-fix thay vì `pnpm check:fix` | Medium | Accept | Phase 3 (Task 3.1) |

### Whole-Plan Consistency Sweep (Red Team Session 1)
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-assignment-target-scope-backfill-and-sync.md`, `phase-03-verification-e2e-and-visual-pot.md`
- Decision deltas checked: 12
- Reconciled stale references: 12
- Unresolved contradictions: 0

<!-- slug: 958-fix-grading-card-and-submission-denominator -->
