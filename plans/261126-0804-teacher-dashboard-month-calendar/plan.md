---
title: "Thêm Mini Calendar (Lịch tháng) vào /teacher/dashboard theo open-design/teacher.html"
description: "Bổ sung widget Lịch tháng dạng chỉ xem (read-only) theo giờ Việt Nam vào đầu cột phải trang /teacher/dashboard (trên Cần kiểm tra và Toàn trung tâm) theo bản thiết kế open-design/teacher.html, dùng dữ liệu buổi dạy thật từ kernel snapshot với allowlist lớp active và mô hình hybrid 1-pass cho lớp legacy, bảo toàn 100% hợp đồng E2E/RBAC và chuẩn UX/AX REVIEW.md."
status: in-progress
priority: P1
effort: "3h"
issue: 976
branch: vinh19410/Add-calendar-teacher-dashboard
tags: [enhancement, frontend, dashboard, calendar, ux]
created: 2026-11-26
---

# Plan: Thêm Mini Calendar (`Lịch tháng`) vào `/teacher/dashboard` theo `open-design/teacher.html`

## Overview

Bổ sung widget **Lịch tháng** (`MonthCalendarSection`) vào đầu cột phải (`side-stack`) của `/teacher/dashboard` — ngay phía trên `Cần kiểm tra` (`RiskStudentsSection`) và `Toàn trung tâm` (`OrgStatsSection`) — khớp bản thiết kế `open-design/teacher.html` (bản nâng cấp trực tiếp trên giao diện dashboard #954, commit `28c4d524`), tuân thủ hệ token `packages/ui/src/styles/globals.css`, quy ước `DESIGN.md` và checklist `REVIEW.md`:

- **Tầng selector thuần, allowlist fail-closed & mô hình hybrid 1-pass (`apps/web/src/lib/dashboard-calendar.ts`):**
  - Chỉ đọc dữ liệu buổi dạy thật từ `data.lessons` và `data.classes` (đồng nhất 1-1 với Hero, `FocusSessionCard`, `Lịch hôm nay` và `Lịch sắp tới` đối với lớp `dated` v2 và lớp legacy `unresolved`).
  - Lọc lớp theo **allowlist fail-closed** `activeClassById` (chỉ nhận các lớp có `status === "active"`, đồng bộ nguyên tắc `apps/server/src/routes/dashboard-reminders.ts:110-127`): loại bỏ hoàn toàn mọi buổi của lớp `paused` (kể cả lịch sử `completed`/`absent`, bảo vệ `class-status.spec.ts:278` & `dashboard.test.tsx:709`) và các dòng mồ côi `classId` không nằm trong `classes`; đồng thời loại mọi buổi `status === "cancelled" || status === "holiday"` (`TOS-11`).
  - Nhóm buổi theo `(classId, normalizedTime)` dùng khóa phút `parseTimeToMinutes(time) ?? time.trim()` (tách bạch 2 ca khác giờ cùng lớp trong cùng ngày, chống trùng `"9:00"` vs `"09:00"`) và sắp xếp theo số phút qua `compareLessonTime` (export từ `dashboard-from-kernel.ts`).
  - Xử lý lớp legacy (`lesson.date == null || lesson.date === ""`) theo **mô hình hybrid 1-pass**:
    - Lọc bỏ `status === "holiday"` **trước khi** gọi `buildClassSessions` (vì theo `TOS-11` I4 tại `class-sessions.ts:370`, `holiday` không tiêu thụ số buổi và `slotStatsBySid` không đếm `holiday`), giữ lại `cancelled` để bảo toàn prefix heuristic; nếu một lớp trộn cả dòng `dated` hợp lệ lẫn `undated`, không chạy `buildClassSessions` trên tập con `undated` mà đẩy thẳng sang `unresolvedLegacyRows` để tránh đếm lệch về `startDate`.
    - Với lớp legacy thuần `undated` và có cấu trúc hợp lệ (`buildClassSessions` trả về mảng non-null): gắn đúng vào các ngày `dateISO` hữu hạn của khóa học (loại occurrence có `sessionStatus(occ) === "cancelled"`). **Lệch có chủ đích so với `lessonsToday` (`dashboard-from-kernel.ts:56-58`)**: `lessonsToday` vẫn chiếu weekday-model cho lớp legacy, còn Lịch tháng giới hạn ngày hữu hạn như `/schedule` (`schedule-week.ts:399-409`) để không chấm ảo vô tận từ 1970–2099 khi lướt tháng.
    - Với lớp legacy `unresolved` (free-text `schedule`, non-ISO `startDate`, row lệch slot, hoặc malformed non-empty `date` như `"2026-02-30"`): lọc `cancelled`/`holiday` và guard `1 <= lesson.day <= 7` nguyên, fallback theo thứ `lesson.day`.
  - Lưới tháng thuần UTC string (`monthCalendarGrid(viewYm)`): guard chặt `YM_PATTERN` (`1970-01`..`2099-12`) và `Number.isInteger(delta)` để không bao giờ ném `RangeError` hay trả `"Thứ NaN"`; 7 cột Thứ Hai → Chủ Nhật (`T2..CN`), ô trống đầu tháng dùng mảng hằng `LEADING_BLANK_KEYS` (không dính `lint/suspicious/noArrayIndexKey`), chỉ hiển thị ngày `1..daysInMonth`; tiêu đề tháng deterministic `"Tháng M năm YYYY"`.
- **Widget UI chỉ xem (`apps/web/src/components/dashboard/month-calendar-section.tsx`):**
  - Khung `<section aria-labelledby="dashboard-calendar-title" className="min-w-0">` với `<h2>Lịch tháng</h2>` và `<Card data-testid="dashboard-month-calendar" className="grid min-w-0 gap-3 p-4">`.
  - Thanh đầu lịch chịu reflow `320px` + `pointer: coarse`: `flex flex-wrap items-center justify-between gap-1`, nhãn tháng `data-testid="dashboard-calendar-month"` dùng `min-w-0 grow basis-auto whitespace-nowrap font-semibold text-sm` để không bị bóp gãy 3 dòng khi hiện nút `"Hôm nay"` trên màn hẹp cảm ứng; nút `"Hôm nay"` chỉ hiện khi `viewYm !== todayIso.slice(0, 7)`; nút `Tháng trước` / `Tháng sau` (`disabled` tại biên `1970-01` / `2099-12`). Khi bấm `"Hôm nay"`, dùng `todayBtnRef` (không dùng `querySelector` nội suy chuỗi) để chuyển focus sang nút ngày hôm nay.
  - Lưới ngày (`role="group" aria-label="Chọn ngày để xem buổi dạy"`): ngày cuối tuần `text-muted-foreground`, hôm nay chưa chọn `font-bold text-foreground shadow-[inset_0_0_0_1px_var(--input)]`, ngày đang chọn `aria-pressed="true"` dùng `bg-primary text-primary-foreground shadow-none`, ô có buổi dạy có chấm tròn `4px` `bg-current` ở đáy giữa; chiều cao `h-9 pointer-coarse:h-11` (tuyệt đối không đặt `min-w-11` lên ô ngày).
  - Vùng agenda (`data-testid="dashboard-calendar-agenda"`, read-only): tiêu đề `${selLabel} · dd/MM` (nối ` · N buổi dạy` khi có buổi), mỗi dòng hiển thị giờ `HH:mm` mono + tên lớp truncate, hoặc `"Không có buổi dạy."` khi trống. Tuyệt đối không dùng từ `"ca dạy"`.
  - **1 vùng `aria-live="polite"` duy nhất** (`<p role="status" aria-live="polite" data-testid="dashboard-calendar-live" className="sr-only">`) cập nhật chỉ khi người dùng chủ động chuyển tháng/chọn ngày với mẫu chuỗi riêng (`"Đang xem Tháng M năm YYYY"`, `"Đã chọn Thứ ... dd/MM, N buổi dạy"`, `"Đã chọn Thứ ... dd/MM, chưa có buổi dạy"`) để không trùng text hiển thị khi query RTL/Playwright, đáp ứng `REVIEW.md:33`.
  - State nguyên tử `{ viewYm, selectedIso }` + rollover nửa đêm giờ VN trong `useEffect([todayIso])` dùng functional updater: chỉ tự dịch `selectedIso` khi `cur.selectedIso === prevToday`, và chỉ tự dịch `viewYm` khi **cả** `cur.selectedIso === prevToday && cur.viewYm === prevToday.slice(0, 7)` (bảo vệ đêm cuối tháng không cướp tháng đang xem khi user đã chọn ngày tay).
- **Tích hợp & Kiểm chứng:**
  - Gắn `<MonthCalendarSection>` vào đầu cột phải `.space-y-10` trong `apps/web/src/routes/_auth/dashboard.tsx` (trên `<RiskStudentsSection>` và `<OrgStatsSection>`).
  - Xác minh unit tests (`dashboard-calendar.test.ts`, `dashboard.test.tsx`, `pnpm --filter web test`), 3 spec E2E mục tiêu trên port `8100–8105` (không chạy full E2E), `pnpm design:compare --screens t-dashboard --side app --force`, kiểm 4 chiều ngang (`1440px`, `768px`, `375px`, `320px` gồm cả context `hasTouch: true`) Light & Dark, và chụp bộ 6 ảnh POT sạch.

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - Chỉ thêm/chỉnh sửa trong bề mặt `/teacher/dashboard`:
    - `apps/web/src/lib/dashboard-from-kernel.ts` (chỉ export `compareLessonTime`).
    - `apps/web/src/lib/dashboard-calendar.ts` và `apps/web/src/lib/dashboard-calendar.test.ts`.
    - `apps/web/src/components/dashboard/month-calendar-section.tsx`.
    - `apps/web/src/routes/_auth/dashboard.tsx` và `apps/web/src/routes/_auth/dashboard.test.tsx`.
  - Không thay đổi server API (`apps/server/*`), DB schema (`packages/db/*`), wire contract (`packages/api/*`), `AppShell` dùng chung, hay các file lịch `/schedule` (`schedule-month.ts`, `schedule-week.ts`, `schedule-day.ts`).
  - Tuyệt đối không stage hay commit file tham chiếu untracked `open-design/teacher.html` hay file spec tạm `_tmp-*.spec.ts`.
- **Explicit Non-Goals:**
  - Không tái sử dụng `buildMonthCells` / `resolveWeekColumnEntries` của `/schedule` (vì hai hàm đó giữ historical rows cho lớp `paused`, giữ `holiday` lessons, cap 3 item/ô và dựng 42 ô tràn tháng lân cận).
  - Không trộn `data.events` (sự kiện org), `data.holidays` (kỳ nghỉ) hay `selectProjectedWeekBlocks` (lớp 0 row) vào mini calendar để giữ gọn đúng `open-design/teacher.html` và đồng nhất buổi dạy thật với `Lịch hôm nay`.
  - Không biến ô ngày hoặc dòng agenda thành link/thao tác điểm danh (giữ read-only theo `open-design/teacher.html` và tiền lệ #278 / #954).
  - Không dùng chuỗi `"ca dạy"` trong mini calendar (bảo vệ `daily-attendance.spec.ts:201`).
  - Không chạy full E2E suite ở local (chỉ chạy 3 spec mục tiêu trên port `8100–8105` theo `AGENTS.md`).

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Xây dựng tầng selector thuần `dashboard-calendar.ts` (allowlist lớp active, index buổi dạy 1-pass hybrid + lưới tháng UTC an toàn đầu vào bẩn) có độ phủ unit test đầy đủ (TDD) | P1 |
| 2 | Xây dựng `MonthCalendarSection` theo `open-design/teacher.html` & `DESIGN.md`/`REVIEW.md`, tích hợp vào đầu cột phải `/teacher/dashboard` và khóa bằng unit/integration tests (TDD) | P1 |
| 3 | Xác minh 3 spec E2E mục tiêu, `pnpm design:compare`, reflow 320px–1440px (gồm `hasTouch: true`) Light/Dark và chụp bộ 6 ảnh POT sạch | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Pure Calendar Index, Grid Math & Selectors (TDD)](./phase-01-start.md) | Pending |
| 2 | [Phase 2: MonthCalendarSection UI & Dashboard Integration (TDD)](./phase-02-month-calendar-ui-and-dashboard-integration.md) | Pending |
| 3 | [Phase 3: E2E Verification, Design Compare & 3-Viewport Visual POT](./phase-03-verification-e2e-and-visual-pot.md) | Pending |

## Success Criteria

- [ ] `buildDashboardCalendarIndex` dùng allowlist fail-closed `activeClassById` (loại 100% lớp `paused` kể cả lịch sử `completed`/`absent` và dòng mồ côi), loại `cancelled`/`holiday` (kể cả trong lớp legacy trước `buildClassSessions`), đẩy tập con undated của lớp trộn dated+undated sang fallback, chuẩn hóa dedup theo số phút, trả `readonly DashboardCalendarSession[]` từ `sessionsForDashboardDate`, và guard đầu vào bẩn trên mọi hàm ngày/tháng (`1970-01`..`2099-12`, không `RangeError` / `"Thứ NaN"`).
- [ ] `MonthCalendarSection` đặt ở đầu cột phải `/teacher/dashboard` (trên `Cần kiểm tra` và `Toàn trung tâm`), dùng `LEADING_BLANK_KEYS` sạch Biome, header `flex-wrap` không bóp vỡ nhãn tháng ở `320px` + `pointer: coarse`, chấm buổi dạy `bg-current`, viền hôm nay `var(--input)`, trạng thái chọn `bg-primary text-primary-foreground`, agenda read-only dùng `"buổi dạy"` (không có `"ca dạy"`), 1 vùng `aria-live="polite"` duy nhất với thông báo không trùng text hiển thị, trả focus bằng `todayBtnRef` sau khi bấm `"Hôm nay"`, và rollover nửa đêm VN nguyên tử (kể cả đêm cuối tháng) không cướp lựa chọn thủ công.
- [ ] `pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter web test`, 3 spec E2E mục tiêu (`dashboard-reminders.spec.ts`, `daily-attendance.spec.ts`, `class-status.spec.ts` không sửa assertion) và `pnpm design:compare --screens t-dashboard --side app --force` đều pass; không tràn ngang ở `320px` (cả `hasTouch: true` lẫn thường) / `375px` / `768px` / `1440px` Light & Dark; đủ 6 ảnh POT trong `plans/reports/` theo tiền tố issue; `open-design/teacher.html` không bị stage và không sót `_tmp-*.spec.ts`.

## Handover Note (`--advice`)

Kế hoạch này đạt chuẩn bàn giao (`advice-handover-plan.md`) cho executor model tầng thấp hơn: mỗi phase chia thành các task tự chứa với tệp/symbol chính xác, điều kiện TDD đỏ/xanh rõ ràng, lệnh `Verify` cơ học và khối `## Failure Protocol` bắt buộc dừng để xin tư vấn `kongming` ngay khi bất kỳ bước kiểm chứng nào thất bại.

## Validation Log

### Session 1 — 2026-11-26
**Trigger:** Chốt kết quả Red-Team (12 phát hiện có bằng chứng `file:line`), phạm vi dữ liệu/tương tác của Mini Calendar và chiến lược xử lý lớp legacy không ngày trước khi triển khai.
**Questions asked:** 3 (gộp Red-Team user adjudication + Validation interview trong 1 lượt `ask_question`).

#### Questions & Answers

1. **[Red-Team Adjudication]** Áp dụng 12 phát hiện Red-Team có bằng chứng file:line (4 Critical, 6 High, 2 Medium) vào kế hoạch trước khi triển khai?
   - Options: `(Recommended) Đồng ý áp dụng toàn bộ 12 phát hiện Red-Team vào kế hoạch` | `Xem xét và quyết định từng phát hiện một` | `Bỏ qua toàn bộ, giữ nguyên kế hoạch hiện tại`
   - **Answer:** `(Recommended) Đồng ý áp dụng toàn bộ 12 phát hiện Red-Team vào kế hoạch`
   - **Rationale:** Toàn bộ 12 phát hiện đều có bằng chứng mã nguồn cụ thể (`TS4104`, Biome `noArrayIndexKey`, bẫy cuối tháng Task 3.3, allowlist fail-closed `activeClassById`, `holiday` trong slot bag `buildClassSessions`, rollover cuối tháng, đầu vào bẩn, trùng selector `sr-only`, `flex-wrap` tại `320px`, fixture 0-based/1-based).

2. **[Scope]** Phạm vi dữ liệu và tương tác của widget Lịch tháng trên /teacher/dashboard?
   - Options: `(Recommended) Chỉ hiển thị buổi dạy thật (read-only, ẩn lớp paused/cancelled/holiday) khớp đúng open-design/teacher.html` | `Hiển thị thêm sự kiện trung tâm (events) và nhãn kỳ nghỉ (holidays) trong agenda lịch tháng` | `Bấm vào ngày chuyển thẳng sang /teacher/schedule?view=day&date=... thay vì chỉ xem agenda inline`
   - **Answer:** `(Recommended) Chỉ hiển thị buổi dạy thật (read-only, ẩn lớp paused/cancelled/holiday) khớp đúng open-design/teacher.html`
   - **Rationale:** Giữ widget gọn, đúng bản thiết kế mới `open-design/teacher.html`, không phát sinh phạm vi ngoài yêu cầu và giữ ngữ nghĩa buổi dạy thống nhất với `Lịch hôm nay`.

3. **[Architecture]** Cách xử lý lớp legacy không có ngày cụ thể (lesson.date == null) khi lướt nhiều tháng trên Lịch tháng?
   - Options: `(Recommended) Mô hình Hybrid 1-pass (giới hạn ngày thật qua buildClassSessions cho lớp legacy có cấu trúc rõ, fallback thứ cho lớp free-text)` | `Khớp thuần theo thứ lesson.day cho mọi lớp legacy (trùng 100% với Lịch hôm nay nhưng chấm lặp mọi tháng)`
   - **Answer:** `(Recommended) Mô hình Hybrid 1-pass (giới hạn ngày thật qua buildClassSessions cho lớp legacy có cấu trúc rõ, fallback thứ cho lớp free-text)`
   - **Rationale:** Tránh chấm buổi dạy ảo vô tận từ 1970–2099 cho các lớp legacy có `schedule` JSON + `startDate` ISO, đồng thời không làm mất buổi của lớp free-text/unresolved.

#### Confirmed Decisions
- Áp dụng trọn vẹn 12 phát hiện Red-Team vào `plan.md`, `phase-01-start.md`, `phase-02-month-calendar-ui-and-dashboard-integration.md` và `phase-03-verification-e2e-and-visual-pot.md`.
- Khóa phạm vi vào widget Lịch tháng read-only chỉ hiển thị buổi dạy thật từ lớp `active` (allowlist fail-closed), không trộn `events`/`holidays`/`projected`.
- Dùng mô hình Hybrid 1-pass cho lớp legacy (`buildClassSessions` sau khi lọc `holiday` cho lớp structured không trộn dated; fallback `lesson.day` cho lớp unresolved/trộn), ghi nhận lệch có chủ đích so với `lessonsToday` cho lớp legacy structured.

### Verification Results
- **Tier:** Standard (Fact Checker + Contract Verifier — chạy song song qua 3 reviewer độc lập)
- **Claims checked:** 24
- **Verified:** 12 | **Failed (now fixed in plan):** 12 | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-month-calendar-ui-and-dashboard-integration.md`, `phase-03-verification-e2e-and-visual-pot.md`
- Decision deltas checked: 12 (toàn bộ 12 phát hiện Red-Team + 2 xác nhận Scope/Architecture)
- Reconciled stale references: 12 (`readonly DashboardCalendarSession[]` + `EMPTY_SESSIONS`, `LEADING_BLANK_KEYS`, ngày seed nội tháng + `trap` + `hasTouch: true` + check git/tmp + tiền tố POT theo frontmatter `issue`, allowlist `activeClassById`, lọc `holiday` trước `buildClassSessions` + guard `classesWithDatedRows`, thống nhất `date: ""`, lệch có chủ đích legacy structured với `lessonsToday`, state nguyên tử `{ viewYm, selectedIso }` + rollover cuối tháng + `todayBtnRef`, guard `YM_PATTERN`/`Number.isInteger`/`isValidISODate`/`day 1..7`/dedup phút, `data-testid` + chuỗi `aria-live` không trùng text, `grow basis-auto whitespace-nowrap` + `justify-between`, fixture `days: [0,2]` + `day: 1/3`)
- Unresolved contradictions: 0

## Red Team Review

### Session 1 — 2026-11-26
**Reviewers:** 3 parallel fresh-context `code-reviewer` subagents (`Security Adversary`, `Assumption Destroyer`, `Failure Mode Analyst`) — Standard tier (Fact Checker + Contract Verifier).
**Findings:** 12 deduplicated (12 accepted, 0 rejected)
**Severity breakdown:** 4 Critical, 6 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | `sessionsForDashboardDate` trả mutable array từ `readonly` map → lỗi biên dịch `TS4104` | Critical | Accept | `plan.md`, Phase 1 (Task 1.2) |
| 2 | `Array.from(..., (_, i) => key={\`blank-${i}\`})` dính lỗi Biome `lint/suspicious/noArrayIndexKey` | Critical | Accept | `plan.md`, Phase 2 (Task 2.2) |
| 3 | Seed `+1/+2/+5` tràn tháng vào `2026-11-26`, thiếu `trap` dọn `_tmp-*.spec.ts`, thiếu check chống stage `open-design/teacher.html`, thiếu `hasTouch: true` và placeholder `<issue>` | Critical | Accept | `plan.md`, Phase 3 (Files, Task 3.3) |
| 4 | Blocklist `pausedIds` fail-open và thiếu nhánh `!cls` gây bất đối xứng dated/undated | Critical | Accept | `plan.md`, Phase 1 (Task 1.1, Task 1.2) |
| 5 | `buildClassSessions` legacy slot bag làm rò rỉ `holiday` (TOS-11) và lớp trộn dated+undated bị đếm lệch về `startDate` | High | Accept | `plan.md`, Phase 1 (Task 1.1, Task 1.2) |
| 6 | Mâu thuẫn đường đi `lesson.date === ""` giữa Task 1.1 và Task 1.2 | High | Accept | Phase 1 (Task 1.1, Task 1.2) |
| 7 | Tuyên bố "đồng nhất 1-1 với Hero/Lịch hôm nay" sai với lớp legacy structured | High | Accept | `plan.md` (Overview, Validation Log) |
| 8 | Rollover cuối tháng (`31/10 → 01/11`) cướp `viewYm`, nguy cơ stale closure và nội suy `todayIso` vào `querySelector` | High | Accept | `plan.md`, Phase 2 (Task 2.1, Task 2.2) |
| 9 | Đầu vào `viewYm`/`delta`/`dateIso`/`lesson.day`/`lesson.time` bẩn gây `RangeError`, `"Thứ NaN"` hoặc trùng ca `"9:00"`/`"09:00"` | High | Accept | `plan.md`, Phase 1 (Task 1.1, Task 1.2) |
| 10 | Vùng `sr-only` `aria-live` dễ trùng text hiển thị trong RTL/Playwright và tiêu đề agenda tách `<span>` làm gãy `getByText` | High | Accept | `plan.md`, Phase 2 (Task 2.1, Task 2.2), Phase 3 (Task 3.3) |
| 11 | `min-w-0 flex-1` trong `.cal-head` vô hiệu hóa `flex-wrap`, bóp vỡ nhãn tháng ở `320px` + `pointer: coarse` | Medium | Accept | `plan.md`, Phase 2 (Task 2.2) |
| 12 | Fixture legacy resolved Task 1.1 dùng `schedule.days: [1,3]` lệch `startDate` Thứ Hai và thiếu `lesson.day` | Medium | Accept | Phase 1 (Task 1.1) |

### Whole-Plan Consistency Sweep (Red Team Session 1)
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-month-calendar-ui-and-dashboard-integration.md`, `phase-03-verification-e2e-and-visual-pot.md`
- Decision deltas checked: 12
- Reconciled stale references: 12
- Unresolved contradictions: 0

<!-- slug: teacher-dashboard-month-calendar -->
