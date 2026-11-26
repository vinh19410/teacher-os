---
title: "Redesign /student/ dashboard theo open-design/redesign-student-dashboard"
description: "Tái thiết kế trang tổng quan học viên (/student/) theo open-design/redesign-student-dashboard với GreetingHeader gọn nhẹ, Top Grid 2 cột (NextTaskHero việc tiếp theo + TodayScheduleCard từ /api/student/schedule đồng bộ org), GoalProgressCard dữ liệu thật kèm thước IELTS trung thực & placement CTA, AssignmentList/ClassCard chuẩn design v2 và cặp thẻ dưới Từ vựng + Học phí — giữ nguyên StudentShell, 0 đổi server API/DB schema và bảo toàn 100% hợp đồng E2E/unit."
status: completed
priority: P1
effort: "4h"
issue: 975
branch: vinh19410/feat-redesign-student-dashboard
tags: [enhancement, frontend, student, dashboard, ux, redesign]
created: 2026-11-26
---

# Plan: Redesign `/student/` Dashboard theo `open-design/redesign-student-dashboard`

## Overview

Tái thiết kế nội dung trang tổng quan cổng học viên `/student/` (`apps/student/src/routes/_auth/index.tsx`, `apps/student/src/components/overview/*`, `apps/student/src/lib/student-overview-selectors.ts`) theo bản mẫu `open-design/redesign-student-dashboard/index.html`, tuân thủ tuyệt đối hệ token `packages/ui/src/styles/globals.css`, nguyên tắc `DESIGN.md` ("dữ liệu thật > hình dáng design"), checklist `REVIEW.md`, tiền lệ PR #955 (`plans/261126-0551-redesign-teacher-dashboard/plan.md`) và toàn bộ hợp đồng E2E/unit đang bảo vệ 4 trang dùng chung (`/` + `/classes` + `/assignments` + `/tuition`):

- **Tầng selector thuần & đồng hồ VN (`student-overview-selectors.ts`):** Bổ sung `enabled?: boolean` và `orgIdOverride?: string | null` cho `UseStudentScheduleOptions` (`apps/student/src/lib/repos/student.ts:422`) để khóa key org ổn định với `me.student.orgId` (tránh double-fetch/nháy skeleton khi `activeOrgId` hydrate `null → orgId` và tránh rò rỉ chéo org khi switch org), đồng thời xây dựng bộ hàm thuần có unit test TDD cho: (1) `selectNextTaskHero` (chỉ chọn `source === "class_assignment"` chưa nộp/chấm, sort theo `overdue` → `due-soon` → `not-submitted` → `dueAtMs`, tách riêng bộ đếm `overdueCount` và `dueSoonCount` trên toàn bộ `overview.assignments` khớp `AssignmentList`, không bịa `mins`/`doing`/`23:59`), (2) `selectTodaySchedule` (nhận cặp nguyên tử `scheduleQuery.data.classes` + `lessons` khi `isSuccess` với allowlist fail-closed `status === "active" && enrollmentStatus === "active"`, loại buổi `cancelled`/`holiday`, dùng đúng cửa sổ Zoom `ZOOM_EARLY_JOIN_MINUTES = 30`, kiểm `Boolean(hasZoom ?? joinUrl)`, xử lý `dur == null` (`endMs === null`) an toàn không ép `nowMs >= null`, đặc tả `relativeText` và ngày mở Zoom khung `00:00–00:29 VN`, tính `upcomingFallback` từ `lessons` khi `isSuccess` và lọc sạch buổi đã qua `endMs <= nowMs`, fallback nhẹ sang `overview.classes` `nextSession` khi lỗi kèm ghi chú), (3) `deriveStudentGoalSummary` (4 chỉ số dữ liệu thật không bịa `examDate`, `parseIeltsBand` nhận `"6.5 IELTS"`/`"IELTS 6.5"`/`"Band 5.5"`/`"8.0+"` không `NaN`, ưu tiên hiển thị `entryScore` non-IELTS như CEFR `"B1"`/`"B1 trở lên"` từ placement mà không vẽ chồng `currentRange`, clamp `[0, 100]` cho band `< 4.0`, nhánh `current >= target` `"Đã đạt mục tiêu"` với gap width `0%`, mapping đầy đủ 6 mức `CURRENT_LEVEL_OPTIONS`, import `EXAM_LABELS`), và (4) `selectStudentTuitionSummary` (cùng quy tắc `isSettled` với `TuitionList`, chuẩn hóa `invoiceTypeLabel` `trim()` + map `"tuition"` → `"Học phí"`, giữ chuỗi `"Học phí"` chắc chắn cho link QR chính và nêu rõ số tiền hóa đơn gần nhất khi có `> 1` hóa đơn chưa đóng).
- **Tách `StudentOverviewContent` sau toàn bộ auth/role/onboarding guard + Header + Top Grid 2 cột (`xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]`):**
  - Toàn bộ hook dữ liệu phụ (`useStudentSchedule`, `useVocabOverview`, `useStudentInvoices`) chỉ mount trong `StudentOverviewContent` SAU khi `me`, `overview`, `onboardingCompletedAt`, và wrong-role guard đều đã pass; bổ sung guard `ACCOUNT_TEACHER_ROLE` cho `scheduleQuery.error` trả `<Loader />` và `useEffect` theo dõi `prevTodayIsoRef` tự invalidate `["student", "overview"]` + `["student", "schedule"]` khi sang ngày VN mới qua nửa đêm.
  - `GreetingHeader`: kicker ngày Việt Nam phía trên `<h1>Chào {displayName}</h1>` (`text-2xl md:text-3xl font-semibold tracking-tight`), bỏ minh họa `StudentSpot` cũ, dòng tóm tắt `aria-live="polite"` tách bạch `overdueCount` và `dueSoonCount` khớp `AssignmentList`, chỉ nối số buổi học còn lại hôm nay khi `scheduleQuery.isSuccess` và khớp org để không nhảy trạng thái khi đang tải.
  - `NextTaskHero` (cột trái): hiển thị bài tập ưu tiên nhất + hàng đợi 2 bài kế tiếp + trạng thái hoàn thành (có `vocabDueCount` thật từ `useVocabOverview()`). Heading cố định `"Việc tiếp theo"` / `"Hoàn thành bài giao"` (tuyệt đối không chứa cụm `"bài tập"` để tránh va chạm strict-mode với `getByRole("heading", { name: "Bài tập" })` của 8 spec E2E học viên), CTA `"Làm bài"` không trùng `aria-label="Làm bài: ${title}"` của `AssignmentRow`, metadata dùng dữ liệu thật (`className`, `skill`).
  - `TodayScheduleCard` (cột phải): lịch hôm nay với skeleton cục bộ, đồng hồ VN `"Bây giờ HH:mm"` cập nhật mỗi 60s + `visibilitychange`, luôn truyền `nowMs={nowMs}` cho mọi `<ZoomJoinButton>` (`"Vào lớp (Zoom)"`, tuyệt đối không render raw `joinUrl` thành link), không bịa `"Phòng 305"`, có empty state + gợi ý buổi học kế tiếp (đã lọc kết thúc/hủy) + link `/schedule`.
- **Thẻ Tiến độ tới mục tiêu (`GoalProgressCard`):** 4 chỉ số thật (`Trình độ hiện tại`, `Band mục tiêu`/`Mục tiêu`, `Cần tăng thêm` hoặc `Thời gian tự học`, `Lớp đang học`), thước IELTS `4.0–9.0` chỉ vẽ khi `examKey === "ielts"` và có target parse được (đã clamp `[0, 100]`, `Math.max(0, ...)` cho gap), và chân thẻ `.goal-note` mang `data-testid="placement-highlight-banner"` + `data-testid="placement-banner-cta"` khi `showPlacementHighlight` bật — kèm nhánh standalone `<PlacementHighlightBanner />` fallback khi học viên thiếu dữ liệu onboarding (`!goalSummary.hasGoalData`).
- **Bài tập, Lớp học & cặp thẻ đáy (`minor-grid`):**
  - `AssignmentList` + `AssignmentRow` (dùng chung với `/assignments`): nâng cấp giao diện danh sách chuẩn design v2 (`rounded-xl border bg-card divide-y`, KHÔNG đặt `overflow-hidden` trên card bọc để bảo toàn 4px `--focus-ring`, dùng `first:rounded-t-xl last:rounded-b-xl` + `focus-visible:relative focus-visible:z-10`), giữ nguyên 4 tab (`Tất cả`, `Sắp đến hạn`, `Quá hạn`, `Đã nộp`) với mặc định `"all"` (bắt buộc cho `student-quiz-take-review.spec.ts:604-610`), `role="tablist"`/`role="tab"`, `aria-hidden="true"` trên badge đếm, toàn bộ hàng nằm trong `<Link aria-label="Làm bài: ... | Xem lại kết quả: ...">`, tiêu đề dùng `<p>` (không `<h4>`).
  - `ClassCard` (dùng chung với `/classes`): tinh chỉnh token v2 và viền nét đứt `border-dashed` cho lớp `invited`, giữ nguyên 100% hợp đồng `data-testid="class-card"`, stretched `<Link>`, `teacher.name` + `teacher.email`, nhãn `Tạm dừng`/`Tham gia lớp`/`Buổi X/Y`/`Buổi tới:`, `ZoomJoinButton` `relative z-10`, và giữ thanh tiến độ `ClassProgress` là thanh trang trí `aria-hidden="true"` (tuyệt đối không gắn `aria-label` hay `aria-labelledby` vì `overview.test.tsx:214` kiểm substring `not.toContain("aria-label")`).
  - Cặp thẻ đáy `minor-grid`: giữ nguyên export `StudentVocabEntrySection` + `deriveStudentHomeVocabSubtitle` từ `apps/student/src/routes/_auth/index.tsx` (kèm `data-testid="vocab-home-entry"` và `vocab-home-due-badge`) cạnh `TuitionSummaryCard` mới (ẩn khi rỗng hoặc lệch org đang chuyển, giữ `<h2>Học phí</h2>`, chuẩn hóa loại hóa đơn `"tuition"`/`"   "` → `"Học phí"`, link trực tiếp `/tuition/$invoiceId` luôn chứa `"Học phí"` cho `tuition-bank-transfer.spec.ts:266-277`, nêu rõ hóa đơn gần nhất khi có `> 1` hóa đơn chưa đóng; còn `/tuition` giữ nguyên `TuitionList`).

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - Chỉ chỉnh sửa frontend trong `apps/student`: `apps/student/src/lib/repos/student.ts` (thêm `enabled?: boolean` và `orgIdOverride?: string | null` cho `UseStudentScheduleOptions`), `apps/student/src/lib/student-overview-selectors.ts`, `apps/student/src/components/overview/*`, `apps/student/src/routes/_auth/index.tsx`, và các unit test tương ứng (`apps/student/src/lib/*.test.ts`, `apps/student/src/components/overview/*.test.tsx`, `apps/student/test/overview.test.tsx`, `apps/student/test/placement-test.test.tsx`, `apps/student/test/wrong-role-loader-fallback.test.tsx`).
  - Không thay đổi server API (`apps/server/*`), DB schema (`packages/db/*`) hay wire contract (`packages/api/*`).
  - Không thay đổi `StudentShell` (`apps/student/src/components/layout/student-shell.tsx`, `student-nav.tsx`) hay `@teacher-os/ui/components/app-shell/*`.
  - Tuyệt đối không stage hay commit thư mục tham chiếu untracked `open-design/redesign-student-dashboard/`.
- **Explicit Non-Goals:**
  - Không port sidebar/topbar/bell/theme-toggle mock từ `open-design/redesign-student-dashboard/index.html`.
  - Không thêm DB migration / API endpoint cho `examDate` hay modal `"Sửa ngày thi"` ở PR này (dùng 4 chỉ số thật từ onboarding + lớp học).
  - Không bịa các trường chưa có trên server: `mins` ("40 phút"), trạng thái `"doing"`, `room` ("Phòng 305"), giờ `"23:59"` khi `dueAt` rỗng, hay 1 điểm band duy nhất từ bucket `"4.5 – 5.5"`.
  - Không rút ngắn cửa sổ Zoom từ `30 phút` (`ZOOM_EARLY_JOIN_MINUTES`) xuống `15 phút` như prototype.
  - Không đổi tab mặc định trên `/` sang `"todo"` (sẽ ẩn bài đã nộp và làm gãy `student-quiz-take-review.spec.ts:604-610`).
  - Không sửa bất kỳ assertion nào trong các spec E2E hiện có, và không chạy full E2E suite ở local (theo `AGENTS.md`).

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Xây dựng bộ selector thuần cho NextTaskHero, TodaySchedule, GoalProgress và TuitionSummary có phủ unit test TDD đầy đủ edge case | P1 |
| 2 | Triển khai trọn vẹn giao diện `/student/` mới theo `open-design/redesign-student-dashboard` và `DESIGN.md`, tách `StudentOverviewContent` sau guard, đồng bộ org-key và bảo toàn 100% hợp đồng E2E/unit | P1 |
| 3 | Xác minh đầy đủ unit tests, 11 spec E2E liên quan (không sửa E2E), `pnpm design:compare --screens s-dashboard --side app --force`, kiểm 4 chiều ngang Light/Dark với đồng hồ server+client đồng bộ và chụp 6 ảnh POT | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Pure Selectors, Time/Goal Helpers & Schedule Hook Option (TDD)](./phase-01-start.md) | Done |
| 2 | [Phase 2: Redesign Student Dashboard Components & Route (TDD)](./phase-02-dashboard-ui-components-and-route.md) | Done |
| 3 | [Phase 3: E2E Verification, Design Compare & 3-Viewport Visual POT](./phase-03-verification-e2e-and-visual-pot.md) | Done |

## Success Criteria

- [x] `student-overview-selectors.ts` xử lý chính xác `source === "grading"` (loại khỏi NextTaskHero, vẫn đếm đồng bộ `overdueCount`/`dueSoonCount` như `AssignmentList`), sort hạn nộp đúng (`overdue` → `due-soon` → `not-submitted` → `dueAtMs`), allowlist lớp `active` từ snapshot `schedule.data.classes`, loại buổi `cancelled`/`holiday` và buổi đã kết thúc khỏi `upcomingFallback`, dùng đúng `ZOOM_EARLY_JOIN_MINUTES = 30`, xử lý `dur == null` (`endMs === null`) & khung `00:00–00:29 VN`, `parseIeltsBand` hỗ trợ `"6.5 IELTS"`/`"IELTS 6.5"`/`"8.0+"` không `NaN`, ưu tiên `entryScore` CEFR không vẽ chồng `currentRange`, clamp `[0, 100]` và `current >= target`, chuẩn hóa `invoice.type` (`"tuition"`/`"   "` → `"Học phí"`).
- [x] `StudentOverviewPage` tách `StudentOverviewContent` sau toàn bộ guard (loading / error / wrong-role / onboarding), chặn `ACCOUNT_TEACHER_ROLE` trên `scheduleQuery.error`, đồng bộ key org `me.student.orgId` (không double-fetch/nháy skeleton hay rò rỉ chéo org), và tự invalidate `overview` + `schedule` khi sang ngày VN mới qua nửa đêm.
- [x] Trang `/student/` hiển thị đầy đủ cấu trúc mới: `GreetingHeader`, Top Grid 2 cột (`NextTaskHero` có `vocabDueCount` thật + `TodayScheduleCard` truyền `nowMs` vào `ZoomJoinButton`), `GoalProgressCard` (có thước IELTS trung thực + `.goal-note` placement CTA hoặc standalone fallback), `AssignmentList` v2 mặc định `"all"` không bị `overflow-hidden` cắt focus ring, `ClassCard` v2 giữ `ClassProgress` `aria-hidden="true"`, và cặp thẻ đáy `StudentVocabEntrySection` + `TuitionSummaryCard`.
- [x] Không vi phạm strict-mode E2E nào: `<h2>Bài tập</h2>` duy nhất, `aria-label="Làm bài: ${title}"` / `"Xem lại kết quả: ${title}"` duy nhất trên `AssignmentRow`, `<h2>Học phí</h2>` + link chứa `"Học phí"` trỏ thẳng `/tuition/$invoiceId`, `data-testid="placement-highlight-banner"` & `placement-banner-cta`, `vocab-home-entry`, `class-card` + `teacher.email` + `"Tham gia lớp"` + `"Tạm dừng"` + `"Vào lớp (Zoom)"`.
- [x] `pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter student test` (không còn `text-bg`), 11 spec E2E liên quan không sửa assertion và `pnpm design:compare --screens s-dashboard --side app --force` pass 100%.
- [x] Không tràn ngang tại `320px`, `375px`, `768px`, `1440px` ở cả Light & Dark mode; đủ 6 ảnh POT trong `plans/reports/`; không commit `open-design/` hay PNG lịch sử bị E2E ghi đè (`748-*`, `781-*`, `student-nav-*`).

## Handover Note (`--advice`)

Kế hoạch này đạt chuẩn bàn giao (`advice-handover-plan.md`) cho executor model ở tầng thấp hơn: mỗi phase chia thành các task tự chứa kèm đường dẫn tệp, symbol chính xác, điều kiện đỏ/xanh TDD, lệnh `Verify` cơ học và khối `## Failure Protocol` bắt buộc dừng và hỏi `kongming` khi bất kỳ bước kiểm chứng nào thất bại.

## Validation Log

### Session 1 — 2026-11-26
**Trigger:** Chốt phạm vi frontend-only (`StudentShell` & `examDate`), hợp đồng E2E (`AssignmentList` 4 tab mặc định `"all"`, `PlacementHighlightBanner`) và adjudicate 11 phát hiện Red-Team trước khi tạo GitHub issue và triển khai.
**Questions asked:** 3 (gộp Red-Team Adjudication + Scope + Contract/Copy trong 1 lượt `ask_question`).

#### Questions & Answers
1. **[Red-Team Adjudication]** Áp dụng toàn bộ 11 phát hiện có bằng chứng `file:line` (3 Critical, 7 High, 1 Medium).
   - **Answer:** `(Recommended) Đồng ý áp dụng toàn bộ 11 phát hiện Red-Team vào kế hoạch`
2. **[Scope — Shell & Ngày thi (`examDate`)]** Giữ frontend-only (0 đổi DB/API, giữ `StudentShell`) hay mở migration thêm `exam_date`.
   - **Answer:** `(Recommended) Chỉ redesign frontend /student/ (giữ StudentShell, 0 đổi DB/API như PR #955); thay "Ngày thi" bằng dữ liệu thật (Thời gian tự học / Lớp đang học) và vẽ thước IELTS trung thực theo entryScore/currentLevel`
3. **[Contract — Bộ lọc Bài tập & Placement Banner]** Giữ chung 4 tab `AssignmentList` mặc định `"Tất cả"` hay tách 3 tab riêng trên `/`.
   - **Answer:** `(Recommended) Giữ chung 4 tab AssignmentList mặc định "Tất cả" (đồng bộ /assignments, bảo toàn E2E) + tích hợp placement-highlight-banner vào chân thẻ GoalProgressCard (kèm fallback đứng riêng nếu thiếu dữ liệu onboarding)`

#### Confirmed Decisions
- Áp dụng trọn vẹn 11 phát hiện Red-Team vào `plan.md`, `phase-01-start.md`, `phase-02-dashboard-ui-components-and-route.md`, `phase-03-verification-e2e-and-visual-pot.md`.
- Khóa phạm vi frontend-only trong `apps/student`, giữ `StudentShell`, 0 đổi DB/API/wire contract, không thêm `examDate`.
- Giữ chung 4 tab `AssignmentList` với mặc định `"all"` và tích hợp `placement-highlight-banner` vào `.goal-note` của `GoalProgressCard` kèm standalone fallback.

### Verification Results
- **Tier:** Standard (Fact Checker + Contract Verifier — chạy song song qua 3 reviewer độc lập)
- **Claims checked:** 24
- **Verified:** 13 | **Failed (now fixed in plan):** 11 | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-dashboard-ui-components-and-route.md`, `phase-03-verification-e2e-and-visual-pot.md`
- Decision deltas checked: 11 (toàn bộ 11 phát hiện Red-Team + 2 quyết định Scope/Contract)
- Reconciled stale references: 11 (`ClassProgress` bỏ `aria-labelledby` dùng `aria-hidden="true"`, tách `StudentOverviewContent` sau guard + guard `ACCOUNT_TEACHER_ROLE` trên `scheduleQuery` + `vocabDueCount`, `orgIdOverride` + cặp nguyên tử `scheduleQuery.data.classes` + allowlist fail-closed, `upcomingFallback` từ `lessons` + `nowMs` trên `ZoomJoinButton` + `dur == null` + `relativeText` + `00:00–00:29 VN`, `parseIeltsBand` `"6.5 IELTS"`/`"B1 trở lên"` + clamp `[0, 100]` + `current >= target` + 6 mức `CURRENT_LEVEL_OPTIONS` + `EXAM_LABELS`, bỏ `overflow-hidden` ở `AssignmentList`, chuẩn hóa `invoiceTypeLabel` `"tuition"`/`"   "` + làm rõ `unsettledCount > 1`, refetch qua nửa đêm VN, nâng Phase 3 Task 3.1 lên 11 spec + sửa glob `plans/261*` thành đường dẫn đích + soát `781-*`/`student-nav-*`, đồng bộ `POST /__e2e/clock` + `vietnamTodayISO()` ở Task 3.3, tách `overdueCount`/`dueSoonCount` ở `GreetingHeader`)
- Unresolved contradictions: 0

## Red Team Review

### Session 1 — 2026-11-26
**Reviewers:** 3 parallel fresh-context `code-reviewer` subagents (`Security Adversary`, `Assumption Destroyer`, `Failure Mode Analyst`) — Standard tier (Fact Checker + Contract Verifier).
**Findings:** 11 deduplicated (11 accepted, 0 rejected)
**Severity breakdown:** 3 Critical, 7 High, 1 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | `aria-labelledby` trên `ClassProgress` chứa substring `"aria-label"` làm fail `overview.test.tsx:214` | Critical | Accept | `plan.md`, Phase 2 (Task 2.3) |
| 2 | `useVocabOverview()` không có `enabled` & `scheduleQuery` thiếu guard `ACCOUNT_TEACHER_ROLE` — cần tách `StudentOverviewContent` sau toàn bộ guard | Critical | Accept | `plan.md`, Phase 2 (Task 2.4) |
| 3 | Lệch org-key `useStudentSchedule` vs `useStudentOverview` gây double-fetch/nháy skeleton lúc đăng nhập và rò rỉ lịch chéo org | Critical | Accept | `plan.md`, Phase 1 (Task 1.1, 1.2, 1.3), Phase 2 (Task 2.4) |
| 4 | Hợp đồng `selectTodaySchedule` & `TodayScheduleCard` thiếu `upcomingFallback` từ `lessons`, `nowMs` trên `ZoomJoinButton`, `Boolean(hasZoom ?? joinUrl)`, `dur == null`, `relativeText`, và khung `00:00–00:29 VN` | High | Accept | `plan.md`, Phase 1 (Task 1.2, 1.3), Phase 2 (Task 2.1, 2.2) |
| 5 | `parseIeltsBand` & `GoalProgressCard` thiếu `"6.5 IELTS"`, nhánh `entryScore` CEFR (`"B1"`), clamp `< 4.0`, `current >= target`, đủ 6 mức `CURRENT_LEVEL_OPTIONS`, `EXAM_LABELS` | High | Accept | `plan.md`, Phase 1 (Task 1.2, 1.3), Phase 2 (Task 2.1, 2.2) |
| 6 | `AssignmentList` bọc `overflow-hidden` cắt 4px `--focus-ring` của `AssignmentRow` trên `/` và `/assignments` | High | Accept | `plan.md`, Phase 2 (Task 2.3) |
| 7 | `TuitionSummaryCard` bị gãy với `type = "tuition"` (`design-seed.ts:560`) / whitespace / nhiều hóa đơn chưa đóng | High | Accept | `plan.md`, Phase 1 (Task 1.2, 1.3), Phase 2 (Task 2.1, 2.2, 2.4) |
| 8 | Thiếu refetch `overview` + `schedule` qua nửa đêm giờ VN khi `refetchOnWindowFocus: false` | High | Accept | `plan.md`, Phase 2 (Task 2.4) |
| 9 | Phase 3 Task 3.1 dùng `git checkout -- plans/261*` đè thư mục plan hiện tại, sót `781-*`/`student-nav-*`, và thiếu 4 spec bảo mật (`/student/` wrong-role, multi-org, zoom, study-pack) | High | Accept | `plan.md`, Phase 3 (Task 3.1) |
| 10 | Phase 3 Task 3.3 thiếu `POST /__e2e/clock` đồng bộ đồng hồ API server với `page.clock` và quy ước `vietnamTodayISO()` | High | Accept | `plan.md`, Phase 3 (Task 3.3) |
| 11 | `GreetingHeader` gộp `overdue + due-soon` vào nhãn `"sắp đến hạn"` gây mâu thuẫn với tab `AssignmentList` | Medium | Accept | `plan.md`, Phase 1 (Task 1.2, 1.3), Phase 2 (Task 2.3, 2.4) |

### Whole-Plan Consistency Sweep (Red Team Session 1)
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-dashboard-ui-components-and-route.md`, `phase-03-verification-e2e-and-visual-pot.md`
- Decision deltas checked: 11
- Reconciled stale references: 11
- Unresolved contradictions: 0

<!-- slug: redesign-student-dashboard -->
