---
title: "Hiển thị các buổi đã qua chưa điểm danh trên Dashboard và trang Điểm danh (#959)"
description: "Đưa nợ điểm danh các buổi đã qua (date < today, status = upcoming) lên GET /api/dashboard/reminders (opt-in ?v=2 an toàn deploy skew 2 chiều), thẻ nhắc việc #1 trên /teacher/dashboard và trang /teacher/attendance qua endpoint chuyên biệt GET /api/attendance/overdue + chip/banner Quá hạn với chấm điểm danh trực tiếp, auto-advance và đồng bộ cache DataProvider."
status: completed
priority: P1
effort: "4.5h"
issue: 959
branch: vinh19410/c-c-bu-i-qua-ch-a-i-m-danh-b-n-kh-i-b-ng-i-u-khi
tags: [bugfix, attendance, dashboard, ux, api, web]
created: 2026-11-26
---

# Plan: Hiển thị các buổi đã qua chưa điểm danh trên Dashboard và trang Điểm danh (#959)

## Overview

Khắc phục bug #959 ("Các buổi đã qua chưa điểm danh bị ẩn khỏi bảng điều khiển và trang Điểm danh") trên cả backend (`packages/api`, `apps/server`) lẫn giao diện giáo viên (`apps/web`):

- **Nguyên nhân gốc đã chứng minh:**
  1. `apps/server/src/routes/dashboard-reminders.ts:99` lọc cứng `eq(lesson.date, today)`, bỏ qua toàn bộ các buổi `dated` đã qua (`lesson.date < today`) còn `status = "upcoming"`.
  2. `packages/api/src/contracts.ts:3081-3119` không có `date` trên `dashboardReminderItemSchema` và không phân tách `today`/`overdue` trong `dashboardRemindersResponseSchema.attendance`.
  3. `apps/web/src/components/dashboard/reminder-cards.tsx:59-91` hiển thị tiêu đề `"Ca dạy hôm nay chưa điểm danh"`, key preview thiếu `date` (`${item.classId}-${item.time}` sẽ đụng khi cùng lớp có nhiều ngày quá hạn), và chỉ dẫn về `/attendance?date=${data.date}&status=pending`.
  4. `apps/server/src/routes/daily-attendance.ts:88` và `apps/web/src/routes/_auth/attendance.tsx` chỉ hỗ trợ lọc một ngày đơn lẻ (`?date=YYYY-MM-DD&status=all|pending|completed`), không có bề mặt hiển thị nợ điểm danh các ngày trước; `sessionKey` (`attendance.tsx:72-76`) thiếu `date` và `handleSaveSession` (`attendance.tsx:180`) gửi cứng `searchAtStart.date`.

- **Giải pháp chốt cùng `kongming` (`--advice`) và đã qua Red-Team / Validation Session 1:**
  1. **Contract & Server (Phase 1):** Giữ nguyên `GET /api/attendance/daily` (100% backward-compatible). Mở rộng `computeReminders` đếm `attendance.pending = today + overdue` kèm optional `today`, `overdue`, `items[].date`; HTTP `GET /api/dashboard/reminders` dùng opt-in `?v=2` (client mới gửi `?v=2` nhận đủ field mới, client cũ không có `?v=2` vẫn nhận `pending = today + overdue` đúng shape `.strict()` cũ — an toàn deploy skew 2 chiều khi `serverWorker` deploy trước `lmsWorker` tại `packages/infra/alchemy.run.ts:318-320`). Bổ sung endpoint chuyên biệt `GET /api/attendance/overdue` dùng chung helper 4-bảng có đủ predicate cô lập `orgId` (`lesson`, `classTable`, `enrollment`, `student`) với `computeReminders`, truy vấn Bước 2 theo lô 25 cặp `(classId, date)` ăn trực tiếp `lesson_class_date_idx` + guard TOCTOU (`.min(1)` trên `students`, bỏ bucket hết `upcoming`/rỗng, trừ `dropped` khỏi `totalCount`), sắp mới nhất trước (`date DESC, time ASC, className ASC`), `?limit=` strict (`undefined`/`""` → 50, không khớp `/^[1-9]\d*$/` → 400 `invalid-limit`, `> 100` → clamp 100), chunk D1 50 cho cả `attendance` và `overdueGrading`, và truyền thống nhất `resolveReminderScope(ctx.role)` + `deps.now`.
  2. **Web UI & Cache Sync (Phase 2):** Export `attendanceBaseQueryKey = ["kernel", "attendance"] as const` và đổi `apps/web/src/lib/data-provider.tsx:121-123` invalidate prefix cha này để cả `daily` lẫn `overdue` không bị stale vĩnh viễn dưới `staleTime: Number.POSITIVE_INFINITY` (`query-client.ts:19-22`). Cập nhật `fetchDashboardReminders` gửi `?v=2`. Nâng cấp thẻ #1 `ReminderCards` (tiêu đề `"Ca dạy chưa điểm danh"`, breakdown `--destructive` cho ca quá hạn, hiển thị `dd/MM · HH:mm` cho item quá hạn, key kèm `date`, smart link sang `status=overdue` khi `today === 0 && overdue > 0`). Mở rộng `/teacher/attendance` thêm chip thứ 4 `"Quá hạn"` (`status=overdue`, badge đếm `aria-hidden`), banner cảnh báo đỏ trên các tab ngày khi `totalCount > 0`, helper `isSessionPaused(session)` tránh lỗi `TS2339`, `sessionKey` kèm `date`, `handleSaveSession` dùng `session.date ?? searchAtStart.date`, auto-expand/auto-advance (kèm guard `queryState/dataUpdatedAt`, giữ `prevIndex`, xử lý `404 not-found`), nút `"Thử lại"` theo tab active, đồng bộ `todayISO` qua nửa đêm VN + chống clock skew, và hiển thị ngày + badge `"Quá hạn"` (chỉ cho `mode === "dated"`) trên `AttendanceSessionRow`.
  3. **Kiểm chứng (Phase 3):** Cập nhật & bổ sung kịch bản 6 buổi quá khứ trên 2 spec E2E liên quan (`dashboard-reminders.spec.ts`, `daily-attendance.spec.ts`) với `seedQuizFixture` 6 ngày `< TODAY` và assertion scope theo `reminder-card-attendance`, chạy `pnpm check`, `pnpm check-types`, full unit tests (`api`, `server`, `web`), 2 spec E2E lẻ, `pnpm design:compare`, và chụp POT 3 viewport Light/Dark theo `REVIEW.md`.

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - `packages/api/src/contracts.ts` và `packages/api/src/attendance.test.ts`: thêm `date?` vào `dashboardReminderItemSchema`, `today?`/`overdue?` vào `dashboardRemindersResponseSchema.attendance`, thêm `overdueAttendanceSessionSchema` (với `students.min(1)`) & `overdueAttendanceResponseSchema`.
  - `apps/server/src/routes/dashboard-reminders.ts`, `apps/server/src/routes/daily-attendance.ts`, cùng 2 file test tương ứng: chia sẻ helper 4-bảng cô lập `orgId`; `computeReminders` tính `pending = today + overdue` + chunk D1 cho `assignmentRows`; `GET /api/dashboard/reminders` hỗ trợ opt-in `?v=2`; thêm `computeOverdueAttendance` và `GET /api/attendance/overdue` (batch 25 cặp `(classId, date)`, guard TOCTOU, `?limit=` strict, `resolveReminderScope(ctx.role)`, `deps.now`).
  - `apps/web/src/lib/attendance-draft.ts`, `apps/web/src/lib/repos/daily-attendance.ts`, `apps/web/src/lib/repos/dashboard-reminders.ts`, `apps/web/src/lib/data-provider.tsx`, `apps/web/src/components/dashboard/reminder-cards.tsx`, `apps/web/src/components/attendance/attendance-session-row.tsx`, `apps/web/src/routes/_auth/attendance.tsx`, và các file unit test tương ứng (`daily-attendance.test.ts`, `data-provider.test.tsx`, `reminder-cards.test.tsx`, `dashboard.test.tsx`, `attendance-session-row.test.tsx`, `attendance.test.tsx`).
  - `apps/e2e/specs/dashboard-reminders.spec.ts` và `apps/e2e/specs/daily-attendance.spec.ts`: đồng bộ copy thẻ #1 và bổ sung kịch bản E2E nợ điểm danh 6 buổi quá hạn.
- **Explicit Non-Goals:**
  - Không đưa lớp `legacy` (`lesson.date IS NULL`) vào danh sách quá hạn hay gắn badge `"Quá hạn"` hoặc cho phép lưu điểm danh lớp `legacy` trên `/attendance`.
  - Không thay đổi hành vi hoặc schema của `GET /api/attendance/daily` và `PUT /api/classes/:id/sessions/:date/attendance` (`apps/server/src/routes/kernel.ts` không sửa).
  - Không đặt ngưỡng cắt ngày lookback (30/90 ngày) làm ẩn nợ cũ của lớp đang hoạt động.
  - Không thêm migration DB mới trừ khi benchmark vượt ngưỡng `< 200ms` (unit) / `≤ 2000ms` (E2E).
  - Không sửa `StudentRiskDrawer`, `atRiskRows`, `TodayScheduleSection`, `FocusSessionCard`, `/schedule`, `/classes/$classId`, sidebar badge, hay tiêu đề section `"Việc cần làm hôm nay"`.
  - Không chạy full E2E suite ở local (theo `AGENTS.md`).

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Đồng nhất hợp đồng API (deploy-skew safe 2 chiều) & truy vấn server cho nợ điểm danh quá hạn (reminders + `GET /api/attendance/overdue` nạp đủ roster theo cặp `(classId, date)`) | P1 |
| 2 | Hiển thị và cho phép xử lý trực tiếp nợ điểm danh quá hạn trên Dashboard thẻ #1 và trang `/teacher/attendance`, đồng bộ cache toàn ứng dụng qua `DataProvider` | P1 |
| 3 | Xác minh toàn diện bằng unit test (`api`, `server`, `web`), 2 spec E2E liên quan, `pnpm design:compare` và POT 3 viewport Light/Dark | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Contracts, Shared Overdue Query & Server API (TDD)](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Web Dashboard Reminder Card & Attendance Overdue UX (TDD)](./phase-02-web-dashboard-and-attendance-overdue-ux.md) | Completed |
| 3 | [Phase 3: E2E Scenarios, Design Compare & Visual POT](./phase-03-e2e-visual-verification-and-pot.md) | Completed |

## Success Criteria

- [x] Lớp đang hoạt động có 6 buổi quá khứ chưa điểm danh (0 buổi hôm nay): `GET /api/dashboard/reminders?v=2` trả `attendance.pending === 6`, `attendance.today === 0`, `attendance.overdue === 6` và `items` có `date` hợp lệ (tối đa 3 mục mới nhất); `GET /api/dashboard/reminders` (không có `?v=2`) vẫn trả `attendance.pending === 6` nhưng lược bỏ `today`/`overdue`/`items[].date` để tương thích tuyệt đối `.strict()` của tab web cũ; `GET /api/attendance/overdue` trả `totalCount === 6`, `hasMore === false`, `sessions` độ dài 6 sắp `date DESC, time ASC, className ASC` kèm đủ roster học viên (`students.length >= 1`).
- [x] Ca quá hạn điểm danh dở dang (1 HV `completed` + 1 HV `upcoming`) nạp đủ 2 HV trên `/api/attendance/overdue` và lưu thành công `200` qua `PUT /api/classes/:id/sessions/:date/attendance` (không lỗi `422 incomplete-roster`); Bước 2 truy vấn theo lô 25 cặp `(classId, date)` đánh vào `lesson_class_date_idx` và có guard TOCTOU khi ca đã xong/rỗng giữa 2 bước.
- [x] Lớp `paused`, enrollment không `active`, buổi `cancelled`/`holiday`, lớp `legacy` (`date IS NULL`), dòng `student` khác `orgId`, và dòng `lesson.date` rỗng (`""`) hoặc sai lịch (`"2026-02-30"`) đều không lọt vào nợ quá hạn; HTTP `/api/attendance/overdue` chặn `401`, `403 ACCOUNT_STUDENT_ROLE`, `403 ACCOUNT_ADMIN_ROLE`, cô lập cross-org, và chuẩn hoá `?limit=`.
- [x] `DataProvider` invalidate `attendanceBaseQueryKey = ["kernel", "attendance"]` sau mọi kernel mutation nên cache `overdueAttendanceQuery` không bao giờ stale dưới `staleTime: Infinity`.
- [x] Trên `/teacher/dashboard`: thẻ #1 tiêu đề `"Ca dạy chưa điểm danh"`, hiển thị tổng `pending`, dòng breakdown `--destructive` khi `overdue > 0`, preview kèm `dd/MM · HH:mm` (không trùng React key), Hero không báo `"Mọi việc hôm nay đã xong."`, và click 1 lần dẫn thẳng `/teacher/attendance?date=<today>&status=overdue` khi `today === 0 && overdue > 0` (hoặc `status=pending` khi `today > 0 || pending === 0`).
- [x] Trên `/teacher/attendance`: có chip thứ 4 `"Quá hạn"` (`status=overdue`) kèm badge đếm `aria-hidden`; trên các tab theo ngày khi `totalCount > 0` luôn hiện banner cảnh báo đỏ dẫn sang `status=overdue`; trong `status=overdue` mỗi ca hiển thị ngày học + badge `"Quá hạn"` (chỉ cho `mode === "dated"`), tự mở ca đầu, lưu gọi đúng `PUT /api/classes/:id/sessions/${session.date}/attendance`, xử lý `404 not-found`, nút `"Thử lại"` gọi đúng `overdueQuery.refetch()`, auto-advance kiểm `queryState`/`dataUpdatedAt` + giữ `prevIndex`, tự đồng bộ qua nửa đêm VN & chống clock skew; đổi ngày hoặc bấm `"Hôm nay"` thoát khỏi `status=overdue` mượt mà.
- [x] `pnpm exec biome check .`, `pnpm check-types`, full unit tests (`@teacher-os/api`, `server`, `web`), 2 spec E2E liên quan (`dashboard-reminders.spec.ts`, `daily-attendance.spec.ts`), và `pnpm design:compare --screens t-dashboard --side app --force` (hoàn tất resume 6/6 không `--force` theo tư vấn `kongming` và `AGENTS.md`) đều pass; kiểm 3 viewport (1440×900, 768×1024, 375×812) + 320px reflow Light/Dark không lỗi hiển thị và có ảnh POT trong `plans/reports/`.

## Handover Note (`--advice`)

Kế hoạch này đạt chuẩn bàn giao (`advice-handover-plan.md`) cho executor model ở tầng thấp hơn: mỗi phase chia thành các task tự chứa kèm đường dẫn tệp, symbol chính xác, điều kiện đỏ/xanh TDD, lệnh `Verify` cơ học và khối `## Failure Protocol` bắt buộc dừng và hỏi `kongming` khi bất kỳ bước kiểm chứng nào thất bại.

## Validation Log

### Session 1 — 2026-11-26
**Trigger:** Chốt adjudication 11 phát hiện Red-Team, chiến lược deploy-skew cho `.strict()` trên `GET /api/dashboard/reminders`, và ngữ nghĩa/copy UX trên Dashboard + `/teacher/attendance` trước khi triển khai.
**Questions asked:** 3 (gộp Red-Team adjudication + Validation trong 1 lượt `ask_question`).

#### Questions & Answers
1. **[Red-Team Adjudication]** Xử lý 11 phát hiện Red-Team đã lọc trùng từ 3 reviewer độc lập (4 Critical, 6 High, 1 Medium, tất cả đều có bằng chứng `file:line`).
   - Options: `(Recommended) Đồng ý áp dụng toàn bộ 11 phát hiện Red-Team vào kế hoạch` | `Xem xét và quyết định từng phát hiện riêng` | `Bỏ qua phát hiện Red-Team, giữ nguyên kế hoạch hiện tại`
   - **Answer:** `(Recommended) Đồng ý áp dụng toàn bộ 11 phát hiện Red-Team vào kế hoạch`
   - **Rationale:** Chặn trước 4 lỗi nghiêm trọng (stale cache vĩnh viễn ở `DataProvider`, lỗi biên dịch `TS2339`, deploy skew vỡ `.strict()` trên tab cũ, thiếu predicate `orgId`/`student` JOIN) cùng 7 lỗi vận hành/hiệu năng/test trước khi viết code.
2. **[Architecture / Deploy Skew]** Do `packages/infra/alchemy.run.ts:318-320` deploy `serverWorker` trước `lmsWorker` và tab Dashboard cũ parse `.strict()`, chọn phương án tương thích deploy skew cho `GET /api/dashboard/reminders`.
   - Options: `(Recommended) Dùng opt-in ?v=2 cho client mới (client cũ không có ?v=2 vẫn nhận pending = today + overdue theo shape cũ nên không vỡ .strict() khi serverWorker deploy trước lmsWorker)` | `Theo precedent release-train của repo (luôn trả today/overdue/items[].date trên GET /api/dashboard/reminders, không thêm ?v=2; tab cũ đang mở cần reload sau deploy)`
   - **Answer:** `(Recommended) Dùng opt-in ?v=2 cho client mới (client cũ không có ?v=2 vẫn nhận pending = today + overdue theo shape cũ nên không vỡ .strict() khi serverWorker deploy trước lmsWorker)`
   - **Rationale:** An toàn 2 chiều tuyệt đối cả khi server rollout trước web (tab cũ không crash `ZodError`) lẫn khi web mới gặp server cũ (field optional trên schema).
3. **[UX / Copy & Điều hướng]** Xác nhận hướng UX & copy cho thẻ nhắc việc #1 trên `/teacher/dashboard` và màn `/teacher/attendance`.
   - Options: `(Recommended) Đổi tiêu đề thẻ #1 thành "Ca dạy chưa điểm danh" (đếm tổng hôm nay + quá hạn, hiển thị breakdown đỏ khi có quá hạn, click mở thẳng status=overdue nếu hôm nay = 0) + thêm chip "Quá hạn" và banner đỏ trên /teacher/attendance` | `Giữ tiêu đề "Ca dạy hôm nay chưa điểm danh" khi không có quá hạn, chỉ đổi sang "Ca dạy chưa điểm danh" khi overdue > 0 (giữ nguyên selector/copy cũ khi không có nợ)`
   - **Answer:** `(Recommended) Đổi tiêu đề thẻ #1 thành "Ca dạy chưa điểm danh" (đếm tổng hôm nay + quá hạn, hiển thị breakdown đỏ khi có quá hạn, click mở thẳng status=overdue nếu hôm nay = 0) + thêm chip "Quá hạn" và banner đỏ trên /teacher/attendance`
   - **Rationale:** Giữ nhãn ổn định nhất quán với ngữ nghĩa thực tế (như thẻ #2 Chấm bài và thẻ #3 Học phí), không đổi tiêu đề giật cục theo dữ liệu.

#### Confirmed Decisions
- Áp dụng đầy đủ toàn bộ 11 phát hiện Red-Team vào `plan.md`, `phase-01-start.md`, `phase-02-web-dashboard-and-attendance-overdue-ux.md`, `phase-03-e2e-visual-verification-and-pot.md`.
- Dùng opt-in `?v=2` trên `GET /api/dashboard/reminders` + optional fields trên `dashboardRemindersResponseSchema` cho an toàn deploy-skew 2 chiều.
- Đổi tiêu đề thẻ #1 sang `"Ca dạy chưa điểm danh"`, thêm chip `"Quá hạn"` và banner đỏ trên `/teacher/attendance`, đồng bộ 2 assertion copy ở E2E.

#### Action Items
- [x] Bổ sung `data-provider.tsx`, `data-provider.test.tsx`, `dashboard-reminders.ts` vào scope và Phase 2.
- [x] Chuẩn hoá Bước 1 & Bước 2 của `computeOverdueAttendance` (4-table `orgId` join, batch 25 cặp `(classId, date)`, guard TOCTOU, `?limit=` strict, chunk D1 `assignmentRows`, `lessonId` trong `.select()`, `deps.now`, `resolveReminderScope(ctx.role)`).
- [x] Vá `isSessionPaused`, nút `"Thử lại"`, `404 not-found`, auto-advance `queryState`/`prevIndex`, midnight rollover & `effectiveTodayISO`, loại `legacy` khỏi `isOverdue`, test isolation và E2E seeding/scoping.

#### Impact on Phases
- Phase 1: Bổ sung `?v=2` ở route `/reminders`, `.min(1)` ở `overdueAttendanceSessionSchema.students`, 4-table `orgId` join, batch 25 cặp `(classId, date)`, guard TOCTOU, rule `?limit=` duy nhất, chunk D1 `assignmentRows`, `lessonId` trong `.select()`, `deps.now`, `resolveReminderScope(ctx.role)`, tách `describe` DB mới cho `dashboard-reminders.test.ts`, và chạy `pnpm --filter server test`.
- Phase 2: Bổ sung `attendanceBaseQueryKey` + `data-provider.tsx`/`data-provider.test.tsx`, `fetchDashboardReminders` gửi `?v=2`, helper `isSessionPaused` + chữ ký `handleSaveSession`, sửa nút `"Thử lại"` / `404 not-found` / `queryState` + `prevIndex` / `todayISO` reactive + `effectiveTodayISO` / `session.mode === "dated"` cho `isOverdue`, và dùng `"2099-12-31"` cho test `isFutureDate`.
- Phase 3: Dùng `seedQuizFixture` 6 ngày `< TODAY`, gọi `/api/dashboard/reminders?v=2` khi assert `today`/`overdue`, scope negative assertion `"Đã hoàn tất hôm nay"` vào `reminder-card-attendance`, và chạy đầy đủ `pnpm --filter server test`.

### Verification Results
- **Tier:** Standard (Fact Checker + Contract Verifier — chạy song song qua 3 reviewer độc lập)
- **Claims checked:** 44 (đã hợp nhất giữa 3 reviewer)
- **Verified:** 34 | **Failed (now fixed in plan):** 11 | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-web-dashboard-and-attendance-overdue-ux.md`, `phase-03-e2e-visual-verification-and-pot.md`
- Decision deltas checked: 11
- Reconciled stale references: 11 (`data-provider.tsx` + `attendanceBaseQueryKey`, `isSessionPaused` + `handleSaveSession`, opt-in `?v=2` trên `GET /api/dashboard/reminders`, 4-table `orgId` join + HTTP IDOR/admin 403, batch 25 cặp `(classId, date)` + SQL exclude `cancelled`/`holiday`, TOCTOU guard + `.min(1)` trên `students`, nút `"Thử lại"` + `404 not-found` + `queryState`/`prevIndex` auto-advance, reactive `todayISO` + `effectiveTodayISO` + `overdueAttendanceQueryKey(todayISO)`, rule `?limit=` duy nhất + chunk D1 `assignmentRows` + `lessonId` + `resolveReminderScope(ctx.role)` + `deps.now`, tách DB `beforeEach` trong `dashboard-reminders.test.ts` + `"2099-12-31"` + `pnpm --filter server test`, `session.mode === "dated"` + E2E `reminder-card-attendance` scope & `seedQuizFixture` 6 ngày)
- Unresolved contradictions: 0

## Red Team Review

### Session 1 — 2026-11-26
**Reviewers:** 3 parallel fresh-context `code-reviewer` subagents (`Security Adversary`, `Assumption Destroyer`, `Failure Mode Analyst`) — Standard tier (Fact Checker + Contract Verifier).
**Findings:** 11 deduplicated (11 accepted, 0 rejected)
**Severity breakdown:** 4 Critical, 6 High, 1 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | `DataProvider` bỏ sót invalidate `overdueAttendanceBaseQueryKey` dưới `staleTime: Infinity` | Critical | Accept | `plan.md`, Phase 2 (Files, Task 2.1, Task 2.2) |
| 2 | Lỗi biên dịch `TS2339` (`strict: true`) trên `session.classPaused` của union `AttendanceRowSession` và chữ ký `handleSaveSession` | Critical | Accept | Phase 2 (Task 2.2, Task 2.4) |
| 3 | Deploy skew chiều New Server → Old Web làm vỡ `.strict()` trên tab Dashboard đang mở (`alchemy.run.ts:318-320`) | Critical | Accept | `plan.md`, Phase 1 (Task 1.3, Task 1.4), Phase 2 (Task 2.1, Task 2.2), Phase 3 (Task 3.1) |
| 4 | Bước 2 `computeOverdueAttendance` thiếu predicate cô lập `orgId`/`classId`/`student` và lệch JOIN với Bước 1; thiếu test HTTP cross-org & `403 ACCOUNT_ADMIN_ROLE` (`ACCOUNT_ERROR_CODES.ADMIN_ON_TEACHER_APP`) | Critical | Accept | Phase 1 (Task 1.3, Task 1.4) |
| 5 | Bước 2 quét toàn bộ lịch sử `lesson` thay vì batch theo cặp `(classId, date)` ăn vào `lesson_class_date_idx` | High | Accept | Phase 1 (Task 1.4) |
| 6 | TOCTOU race giữa Bước 1 và Bước 2 phá vỡ `recorded: false`, lọt `students: []`, và lệch `totalCount` | High | Accept | Phase 1 (Task 1.2, Task 1.3, Task 1.4) |
| 7 | Nút `"Thử lại"` tab `overdue` gọi nhầm `dailyQuery.refetch()`, thiếu guard `queryState`/`dataUpdatedAt` & `prevIndex` auto-advance, thiếu xử lý `404 not-found` | High | Accept | Phase 2 (Task 2.1, Task 2.4) |
| 8 | Clock skew & midnight rollover trên `/teacher/attendance` làm sai badge `"Quá hạn"` và đóng băng nợ dưới `staleTime: Infinity` | High | Accept | Phase 2 (Task 2.1, Task 2.2, Task 2.4) |
| 9 | Mâu thuẫn đặc tả `?limit=`, thiếu chunk D1 trên `assignmentRows`, thiếu `lessonId` trong `.select()`, bất nhất `resolveReminderScope(ctx.role)` & `deps.now` | High | Accept | Phase 1 (Task 1.3, Task 1.4) |
| 10 | Shared DB `beforeAll` trong `dashboard-reminders.test.ts`, phantom test `"2026-10-20"`, và thiếu 4 file server test consumer trong Verify | High | Accept | Phase 1 (Task 1.3, Task 1.4, Verification), Phase 2 (Task 2.1), Phase 3 (Task 3.2) |
| 11 | Lớp `legacy` ở ngày quá khứ dính badge `"Quá hạn"` + bẫy E2E (scope `"Đã hoàn tất hôm nay"` vào thẻ #1, `seedDatedClass` mặc định 1 buổi/tuần) | Medium | Accept | Phase 2 (Task 2.4), Phase 3 (Task 3.1) |

### Whole-Plan Consistency Sweep (Red Team Session 1)
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-web-dashboard-and-attendance-overdue-ux.md`, `phase-03-e2e-visual-verification-and-pot.md`
- Decision deltas checked: 11
- Reconciled stale references: 11
- Unresolved contradictions: 0

<!-- slug: 959-overdue-attendance-dashboard-visibility -->
