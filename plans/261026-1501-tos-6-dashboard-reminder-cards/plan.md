---
title: "TOS-6: Thẻ Việc cần làm hôm nay trên Bảng điều khiển + điều hướng 1 chạm"
description: "Thêm khu vực Việc cần làm hôm nay gồm 3 thẻ đếm từ server (ca chưa điểm danh, bài chờ chấm quá 24h, học phí đến hạn/quá hạn), điều hướng 1 chạm sang màn xử lý đã lọc sẵn, và chuẩn bị điểm cắm phạm vi cho Trợ giảng."
status: completed
priority: P1
effort: 2d
issue: 439
branch: feat/tos-6-dashboard-reminder-cards
tags: [feature, frontend, backend, api]
blockedBy: []
blocks: []
created: 2026-10-26
---

# Plan: TOS-6 — Thẻ "Việc cần làm hôm nay" theo phân quyền

## Overview

Bảng điều khiển (`apps/web/src/routes/_auth/dashboard.tsx`) có thêm khu vực **Việc cần làm hôm nay** với 3 thẻ nhắc việc. Cả 3 thẻ đếm ở phía server và trả kết quả trong 2 giây hoặc ít hơn:

1. **Ca học hôm nay chưa điểm danh.** Nút trên thẻ dẫn sang `/attendance?date={today}&status=pending`.
2. **Bài tập quá hạn chấm > 24h.** Đếm `quiz_attempt.status = "submitted"` có `submittedAt` cách đây hơn 24 giờ. Nút dẫn sang `/grading?status=awaiting`.
3. **Học phí đến hạn / quá hạn thu.** Đếm học viên có hoá đơn chưa thu đủ, hạn trong 7 ngày tới hoặc đã quá hạn, kèm tổng tiền còn nợ. Nút dẫn sang `/tuition`.

Nguồn: Jira [TOS-6](https://teacher-os.atlassian.net/browse/TOS-6) (subtask của TOS-5 / US-001), `docs/selfomy-alignment/userstories/us-001.md#AC-001`, wireframe `docs/selfomy-alignment/ascii-wireframe/daily-ops-and-holiday-flow.md` (Screen `dashboard-reminders`), FR-selfomy-alignment-004 và FR-selfomy-alignment-029.

## Scope Challenge

- **Code đã có:**
  - Dashboard tính KPI ở client từ kernel snapshot (`useData()`).
  - Helper `lessonsToday` và `groupLessonsByClassSession` (`apps/web/src/lib/dashboard-from-kernel.ts`).
  - Hàng chờ chấm `quiz_attempt.status = "submitted"` (`apps/server/src/routes/grading.ts`).
  - `effectiveInvoiceStatus` (`apps/web/src/lib/tuition-from-kernel.ts`) và `vietnamTodayISO` (`packages/api/src/vietnam-date.ts`).
  - Trang `/grading` đã nhận `?status=awaiting`.
- **Phạm vi yêu cầu:** đủ 2 scenario của AC-001.
- **Code chưa có:**
  - Vai trò TA / Giáo vụ / Chủ trung tâm. Hiện chỉ có `teacher | student | admin` (`packages/auth/src/role.ts`), và `membership.role` mặc định là `teacher`.
  - Bảng phân công nhân sự theo lớp.
  - Màn Điểm danh tổng theo ngày `[2]`.
- **Độ phức tạp:** khoảng 10 file, 1 router server mới, không có migration DB.
- **Mode:** HOLD SCOPE. Lập plan auto ở mức fast + scout.

## Quyết định đã chốt (2026-10-26)

| # | Quyết định | Lý do |
|---|---|---|
| D1 | **Tách 2 bước cho Scenario 2 (TA).** Plan này làm đủ Scenario 1 trên một API đếm phía server, có tham số phạm vi `ReminderScope`. Scenario 2 là Phase 5, bị chặn cho tới khi có plan vai trò + phân công lớp (FR-029). | FR-029 đang ở Chặng 4 (spec ghi tạm hoãn chờ design partner). Mô hình vai trò chưa tồn tại. |
| D2 | **Tạo route khung `/attendance`.** Route kiểm tra search param `date`/`status` và chỉ hiện khung trang. TOS-7/TOS-8 sẽ dựng nội dung lên route này. | Đích điều hướng phải tồn tại để AC kiểm được URL. Không ôm phạm vi của TOS-7. |
| D3 | **Thẻ bài quá hạn đếm hàng chờ chấm hiện có:** `quiz_attempt` `submitted`, skill writing/speaking, `submittedAt` cách đây hơn 24h. | Không thêm trạng thái mới, không migration, khớp với trang `/grading`. |
| D4 | **Bộ đếm lấy từ API server riêng `GET /api/dashboard/reminders`, không tính từ kernel snapshot.** | Đây là điểm cắm duy nhất để chặn dữ liệu công nợ theo vai trò (Scenario 2). Kernel snapshot hiện gửi toàn bộ hoá đơn của org về trình duyệt. |

## Non-goals

- Không làm nội dung màn điểm danh ngày, điểm danh inline 4 trạng thái hay lưu hàng loạt. Phần này thuộc TOS-7/TOS-8.
- Không thêm vai trò, lời mời nhân sự hay bảng phân công lớp. Phần này thuộc plan FR-029.
- Không loại trừ Lịch nghỉ chung. Tính năng nghỉ lễ chưa có; phần này thuộc FR-005/FR-007.
- Không làm banner gói thuê bao / ví Credit AI (`[2]–[5]` của wireframe).
- Không thêm bộ lọc `?status=overdue,due_soon` cho `/tuition`. Thẻ học phí chỉ dẫn sang `/tuition`; bộ lọc này để cho story Sổ công nợ.
- Không gỡ hàng KPI hiện tại của dashboard.

## Phases

| # | Phase | Trạng thái | Phụ thuộc |
|---|---|---|---|
| 1 | [phase-01-server-reminders-api.md](phase-01-server-reminders-api.md): API đếm 3 thẻ + contract + `ReminderScope` | completed | — |
| 2 | [phase-02-attendance-route-shell.md](phase-02-attendance-route-shell.md): route khung `/attendance` + mục sidebar | completed | — |
| 3 | [phase-03-dashboard-reminder-cards.md](phase-03-dashboard-reminder-cards.md): khu vực "Việc cần làm hôm nay" trên dashboard | completed | 1, 2 |
| 4 | [phase-04-e2e-and-perf.md](phase-04-e2e-and-perf.md): E2E, 3 viewport, design compare, đo 2 giây | completed | 3 |
| 5 | [phase-05-ta-scope-blocked.md](phase-05-ta-scope-blocked.md): Scenario 2 — TA chỉ thấy lớp phân công, ẩn thẻ học phí | blocked | 1, plan FR-029 |

## Acceptance Criteria (map AC-001)

- [x] **Scenario 1:**
  - Người dùng teacher (đại diện cho Giáo viên độc lập / Chủ trung tâm trong mô hình hiện tại) mở `/dashboard` và thấy đủ 3 thẻ có bộ đếm đúng dữ liệu.
  - API trả kết quả trong 2 giây hoặc ít hơn với seed e2e.
- [x] **Scenario 1:** bấm thẻ/nút "Ca học hôm nay chưa điểm danh" thì URL thành `/attendance?date={vietnamTodayISO}&status=pending`.
- [x] **Scenario 2:** đếm theo lớp phân công và không trả block `tuition` khi scope là TA. Phase 1 kiểm phần này bằng unit test trên `ReminderScope`. Hành vi end-to-end với vai trò TA thật được kiểm ở Phase 5 sau khi FR-029 xong.
- [x] `pnpm check`, `pnpm check-types`, test web/server và e2e liên quan đều xanh.

## Rủi ro

- **Lớp legacy có `lesson.date = NULL`:** phải đếm theo `day` (thứ trong tuần) giống `lessonsToday`. Nếu bỏ nhánh này, bộ đếm sẽ lệch với "Lịch hôm nay". Phase 1 có test cho cả 2 nhánh.
- **Hai nguồn số liệu song song:** hàng KPI tính ở client, thẻ nhắc việc đếm ở server. Bộ đếm KHÔNG tự làm mới theo prefix `["kernel"]`: mọi refresh sau action kernel chạy `exact: true` trên `kernelQueryKey` (data-provider.tsx:107, grading/$attemptId.tsx:79-84), chỉ chạm đúng key `["kernel"]`. Phase 3 phải tự nối reminders vào vòng đời kernel snapshot (key theo `dataUpdatedAt` của kernel query hoặc invalidate tường minh) kèm test chứng minh bộ đếm làm mới sau 1 kernel action.
- **Lớp dated dời sang thứ khác:** thẻ điểm danh so lớp dated theo `date = today` còn KPI "Lịch hôm nay" lọc `day` thuần (dashboard-from-kernel.ts:13). Lớp có `date = hôm nay` nhưng `day ≠ thứ hôm nay` sẽ được đếm ở thẻ nhưng không hiện ở KPI (và ngược lại). Chấp nhận lệch có chủ đích này: thẻ nhắc việc theo occurrence thật (`date`), KPI theo khung giờ tuần; đánh số lại nếu user report.
- **"Chưa thu đủ" theo trang đích, không theo KPI:** thẻ học phí lọc `status !== "paid" || paidAmount < amount` (khớp tuition/index.tsx:71) và `outstanding = Σ(amount − min(paidAmount, amount))` (clamp như tuition-from-kernel.ts:259 — hoá đơn trả thừa không kéo tổng âm). KPI "Còn phải thu" lọc `status !== "paid"` thuần nên hoá đơn `paid` mà thiếu tiền sẽ tính ở thẻ nhưng không tính ở KPI — chấp nhận có chủ đích: thẻ khớp trang `/tuition` mà nó dẫn tới.
- **Thứ trong tuần ở server phải suy từ ISO:** server chạy UTC; từ 0h–7h giờ VN, `new Date().getDay()` lệch 1 ngày. Nhánh lớp legacy suy weekday từ `vietnamTodayISO(now)` theo mẫu `isoToLessonWeekday` (kernel.ts:656-660): `new Date(`${iso}T00:00:00Z`).getUTCDay()`. Không dùng `lessonDayFromDate` (local time) ở server.

## Red Team Review

### Session 2 — 2026-10-26 (vibe --advice, controller-run)

Findings: 6 (2 accepted, 4 rejected) — 0 Critical, 1 High, 2 Medium, 3 Minor. Finding 2 nâng cấp thành High sau advisory blocker: refresh action kernel chạy `exact: true`, bộ đếm phải tự nối vòng đời kernel snapshot (đã sửa phase-03 + Rủi ro).
Bối cảnh: reviewer subagent không khả dụng trên host (không có model); red-team chạy inline bởi vibe controller theo 3 lens (Security Adversary + Fact Checker, Failure Mode Analyst + Flow Tracer, Assumption Destroyer + Scope Auditor), Full tier.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | KPI "Lịch hôm nay" là day-only (`lessonsToday` lọc `day === todayDow`, dashboard-from-kernel.ts:13-16); thẻ điểm danh date-aware (lớp dated so `date = today`, legacy so `day`). Lớp dated bị dời sang thứ khác (date = hôm nay, day ≠ hôm nay) khiến 2 nguồn lệch. | Medium | Accept (document) | plan.md Rủi ro |
| 2 | Phase 3 viết "các chỗ đang `invalidateQueries({ queryKey: ["kernel"] })` sẽ tự làm mới" — SAI. Mọi refresh sau action kernel chạy `exact: true` trên `kernelQueryKey = ["kernel"]` (data-provider.tsx:107 — `refetchQueries({ queryKey: kernelQueryKey, exact: true, type: "all" })`; grading/$attemptId.tsx:79-84 — `invalidateQueries({ …, exact: true })`), chỉ chạm đúng key `["kernel"]`, không refetch children như `["kernel", "dashboard", "reminders"]`. Nếu không nối tường minh, bộ đếm stale sau check-in và sau chấm bài. | High | Accept (mở rộng sau advisory blocker) | phase-03 |
| 3 | Nhãn zero-inbox "Đã hoàn tất hôm nay" trên thẻ học phí dễ đọc nhầm "đã thu đủ xong"; copy có thể tinh chỉnh ở review PR. | Minor | Reject (cosmetic) | — |
| 4 | Perf <200ms: 3-4 query đơn giản có index `lesson_org_idx` / `invoice_org_idx`; gate đo đã có ở Phase 4. | Minor | Reject | — |
| 5 | Scope Auditor: `computeReminders(db, orgId, scope, now)` thuần request-scoped qua `kernelCtx` (app.ts:45-50,180); `ReminderScope` không trùng state hiện có, không leak. | Minor | Reject | — |
| 6 | `items` preview trả className/time — không tăng exposure so với kernel snapshot hiện gửi toàn bộ hoá đơn về client; TA scope chặn `finance` ở Phase 5. | Minor | Reject | — |

**Fact Check Summary (claims verify được):** `lessonsToday`/`lessonDayFromDate` (dashboard-from-kernel.ts:8,13), mount `/grading` (kernel.ts:1239), hàng chờ submitted+writing/speaking+2 modes (grading.ts:117-166), gate student 403 (app.ts:134, role-gates.test.ts), `GradingSearch.status "awaiting"|"graded"` (grading/index.tsx:38), `effectiveInvoiceStatus` (tuition-from-kernel.ts:194), `submittedAt timestamp_ms` (schema/quiz-attempt.ts:83), `vietnamTodayISO` (vietnam-date.ts), sidebar dashboard item (sidebar.tsx:31), `design:compare` (package.json), invoice `due` default "" + `paidAmount` (schema/invoice.ts) — 16/16 VERIFIED, 0 FAILED.

### Whole-Plan Consistency Sweep

- Files reread: plan.md, phase-01…phase-04 (phase-05 blocked, không rà).
- Decision deltas checked: 2 (finding 1 → thêm rủi ro; finding 2 → sửa cơ chế refresh ở phase 3).
- Reconciled stale references: 2.
- Unresolved contradictions: 0.

### Verification Results

- Claims checked: 16
- Verified: 16 | Failed: 0 | Unverified: 0

## Validation Log

### Session 1 — 2026-10-26

Đã hỏi 3 câu, cả ba đều chọn phương án đề xuất. Kết quả ghi thành D1–D3 ở trên:
- **Phạm vi TA:** tách 2 bước. Phase 5 bị chặn chờ FR-029.
- **Màn đích [2]:** tạo route khung `/attendance` trong plan này.
- **Bài quá hạn:** đếm hàng chờ `quiz_attempt` submitted quá 24h.

Giả định chưa hỏi (đổi được khi review PR):
- Khu vực nhắc việc đặt trên hàng KPI.
- Hàng KPI cũ giữ nguyên, kể cả 2 ô trùng ý ("Bài tập chưa có điểm", "Còn phải thu").

### Verification Results

- Claims checked: 16 (đường dẫn file, symbol, gate role, script).
- Verified: 16 | Failed: 0 | Unverified: 0.
- Tier: Full (5 phase), kiểm cơ học bằng `test -e` và `grep`.
- Bằng chứng chính:
  - `kernel.route("/grading", …)` ở `apps/server/src/routes/kernel.ts:1239`.
  - Hàng chờ `status = "submitted"` ở `apps/server/src/routes/grading.ts:122,161`.
  - Gate student 403 ở `apps/server/src/role-gates.test.ts:116`.
  - `GradingSearch.status: "awaiting" | "graded"` ở `apps/web/src/routes/_auth/grading/index.tsx:38`.
  - `ClassStaffAssignment` có trong ERD (`selfomy-alignment-erd.md:109`).
  - Script `design:compare` có trong `package.json:29`.
  - `ak plan validate` báo hợp lệ.

### Whole-Plan Consistency Sweep

- Đường dẫn route `/attendance` cùng tham số `date`/`status` khớp nhau ở plan.md, phase 2, 3, 4.
- Query key `["kernel", "dashboard", "reminders"]` chỉ xuất hiện ở phase 3.
- Hợp đồng "thiếu key `tuition`" thống nhất ở phase 1, 3 và 5.
- Không còn mâu thuẫn chưa giải quyết.
