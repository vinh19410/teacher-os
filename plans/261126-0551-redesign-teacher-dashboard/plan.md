---
title: "Redesign /teacher/dashboard theo open-design/redesign-teacher-dashboard"
description: "Tái thiết kế trang /teacher/dashboard theo bản thiết kế open-design/redesign-teacher-dashboard với Hero + Focus Card ca dạy hiện tại/kế tiếp, 3 thẻ Việc cần làm hôm nay cải tiến, Timeline Lịch hôm nay/sắp tới, danh sách Cần kiểm tra kèm Student Detail Drawer dữ liệu thật và khối Toàn trung tâm — giữ nguyên AppShell, 0 đổi API server và bảo toàn hợp đồng E2E/RBAC."
status: completed
priority: P1
effort: "5h"
issue: 954
branch: vinh19410/Redesign-Dashboard
tags: [enhancement, frontend, dashboard, ux, redesign]
created: 2026-11-26
---

# Plan: Redesign `/teacher/dashboard` theo `open-design/redesign-teacher-dashboard`

## Overview

Tái thiết kế nội dung trang `/teacher/dashboard` (`apps/web/src/routes/_auth/dashboard.tsx`, `apps/web/src/components/dashboard/*`, `apps/web/src/lib/dashboard-from-kernel.ts`) theo bản mẫu `open-design/redesign-teacher-dashboard/index.html`, tuân thủ tuyệt đối hệ token `packages/ui/src/styles/globals.css`, quy ước `DESIGN.md` ("dữ liệu thật > hình dáng design"), checklist `REVIEW.md` và toàn bộ hợp đồng test/E2E/RBAC đang có:

- **Vá dữ liệu gốc trước khi dựng UI:** Sửa `lessonsToday` lọc đúng `lesson.date === todayIso` với buổi `dated` (ngăn rò rỉ buổi đa tuần cùng thứ làm sai Focus Card, `"còn M buổi"` và pill `"Đã điểm danh"`), bổ sung state machine Focus Card 6 trạng thái (có guard `time`/`dur` bẩn), hàm `formatEndTime` an toàn không sinh `NaN:NaN`, và selector chi tiết vấn đề thật cho Student Detail Drawer (`deadline.dueDateISO` + guard `due` legacy).
- **Hero 2 cột + Focus Card:** Đưa ngày Việt Nam (`kicker`) lên trên lời chào `formatDashboardGreeting` (3 khung giờ #120), thêm dòng tóm tắt dùng từ `"buổi dạy"` (`Hôm nay có N buổi dạy...` để không va chạm selector toàn trang `"1 ca dạy"` của `daily-attendance.spec.ts:201`) & số việc chờ xử lý (chỉ nối khi `reminders.isSuccess`, fail-closed theo `canAccessFinance === true`), thay minh họa `MorningSpot` bằng `FocusSessionCard` hiển thị ca đang dạy (chấm xanh + thanh tiến độ), ca kế tiếp hôm nay, ca sắp tới trong tuần hoặc trạng thái trống trung thực.
- **Việc cần làm hôm nay (`ReminderCards`):** Nâng cấp bố cục theo prototype (vòng tròn bước đặc chuyển xanh + dấu tích khi hoàn tất, số đếm `font-mono tabular-nums`, đường kẻ phân cách danh sách preview kèm `+{N} ca khác`, nút đáy toàn chiều rộng, trạng thái skeleton + `role="alert"` lỗi + nút `Làm mới` có icon xoay), đổi default `canAccessFinance` sang fail-closed `false`, giữ nguyên `data-testid`, heading `"Ca dạy hôm nay chưa điểm danh"` / `"Bài tập quá hạn chấm > 24h"`, `aria-label`, stretched `<Link>` ôm viền thẻ và cập nhật matcher RTL sạch cho số đếm inline / CTA.
- **Bố cục chia 2 cột (`xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,1fr)]`):**
  - Cột trái: `Lịch hôm nay` dạng vertical timeline (giờ bắt đầu/kết thúc mono, thanh rail + chấm trạng thái, `group-last:border-b-0`, pill read-only `Đang dạy` / `Đã điểm danh` / `Chưa điểm danh`) và `Lịch sắp tới` nhóm theo ngày (chỉ hiển thị `dd/MM` khi có `lesson.date` thật theo #56).
  - Cột phải trên: `<section>` `Cần kiểm tra` chuyển từ `<table>` sang danh sách hàng bấm được (2 hàng trên `< sm` chống tràn 320px, lưới 3 cột từ `sm:` trở lên) mở `StudentRiskDrawer` trượt phải (render qua `createPortal` tại `z-40`/`z-[45]` dưới `CommandDialog` `z-50`, guard `e.defaultPrevented`/dialog khác, `onCloseRef`, effect keyed `openId`, focus trap không dùng `offsetParent`, xóa stale `selectedStudentId`, lọc lớp `active` không `paused`, hiển thị gói học, danh sách buổi quên điểm danh / bài tập quá hạn thật và nút `Mở hồ sơ học viên →` tới `/students/$studentId`).
  - Cột phải dưới: Khối `Toàn trung tâm` dạng `<dl>` xếp dọc (`Tổng học viên`, `Bài tập chưa có điểm`, và `Còn phải thu` fail-closed theo `canAccessFinance === true` kèm hint phạm vi rõ ràng `"trong đó N học viên đến hạn"` chỉ khi `outstanding > 0 && dueStudentsCount > 0`).

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - Chỉ chỉnh sửa nội dung bên trong trang `/teacher/dashboard`: `apps/web/src/lib/dashboard-from-kernel.ts`, `apps/web/src/components/dashboard/*`, `apps/web/src/routes/_auth/dashboard.tsx` và các unit test tương ứng.
  - Không thay đổi server API (`apps/server/*`), DB schema (`packages/db/*`) hay wire contract (`packages/api/*`).
  - Không thay đổi `AppShell` dùng chung (`packages/ui/src/components/app-shell/*`, `apps/web/src/components/layout/*`).
  - Tuyệt đối không stage hay commit thư mục tham chiếu untracked `open-design/redesign-teacher-dashboard/`.
- **Explicit Non-Goals:**
  - Không port sidebar/topbar/bell/theme-toggle mock từ `open-design/redesign-teacher-dashboard/index.html` (đã có `AppShell` dùng chung).
  - Không bịa dữ liệu `room` ("Phòng 201") hay ngày lịch giả cho lớp legacy `date == null` (giữ nguyên invariant issue #56).
  - Không thêm thao tác điểm danh hoặc chấm bài trực tiếp trên timeline dashboard (giữ read-only theo #278 và `dashboard.test.tsx:153`).
  - Không đổi nguồn tính `"Bài tập chưa có điểm"` (`data.assignments.filter(a => a.status !== "graded").length`) hay trust boundary API `/api/kernel` (`packages[].price` / `classes[].tuitionFee`).
  - Không đổi copy đã khóa E2E/unit (`formatDashboardGreeting` 3 buổi theo #120, `fmtVND` dùng `đ`, `"Bài tập quá hạn chấm > 24h"`, Hero dùng `"buổi dạy"` để không đụng `daily-attendance.spec.ts:201`).
  - Không chạy full E2E suite ở local (theo `AGENTS.md`).

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Vá `lessonsToday` cho lớp `dated` và bổ sung bộ selector thuần cho Focus Card 6 trạng thái, timeline, end-time fail-safe và chi tiết rủi ro thật | P1 |
| 2 | Triển khai trọn vẹn giao diện `/teacher/dashboard` mới (Hero/Focus, ReminderCards, Timeline, Risk List + Drawer portal, Toàn trung tâm) theo `DESIGN.md` & bảo toàn 100% hợp đồng E2E/RBAC | P1 |
| 3 | Xác minh đầy đủ unit test, 4 spec E2E liên quan (không sửa E2E), `pnpm design:compare`, kiểm tra 3 viewport + 320px reflow Light/Dark và chụp bộ 7 ảnh POT | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Pure Dashboard Selectors, Focus State Machine & Risk Details (TDD)](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Redesign Dashboard UI Components & Route (TDD)](./phase-02-dashboard-ui-components-and-route.md) | Completed |
| 3 | [Phase 3: E2E Verification, Design Compare & 3-Viewport Visual POT](./phase-03-verification-e2e-and-visual-pot.md) | Completed |

## Success Criteria

- [x] `lessonsToday` lọc đúng `lesson.date === todayIso` cho buổi `dated` và giữ `lesson.day === todayDay` cho buổi legacy `date == null`, không còn rò rỉ trạng thái đa tuần; `formatEndTime` và `resolveDashboardFocus` chịu được chuỗi `time`/`dur` bẩn (không `NaN:NaN`).
- [x] Hero 2 cột hiển thị đúng ngày VN phía trên lời chào `formatDashboardGreeting`, dòng tóm tắt dùng `"buổi dạy"` (không va chạm `daily-attendance.spec.ts:201`), chỉ nối số việc chờ khi `reminders.isSuccess` với fail-closed `canAccessFinance === true`, và `FocusSessionCard` xử lý đúng cả 6 trạng thái với tick 60s + `visibilitychange` + refetch `reminders` khi qua ngày VN mới.
- [x] Khu vực `Việc cần làm hôm nay` giữ nguyên mọi hợp đồng selector/URL/RBAC (`data-testid`, `aria-label`, heading, default fail-closed `canAccessFinance = false`), hiển thị đúng thiết kế mới (step badge, mono count inline block giữ `innerText` `"N ca dạy"`, `+N ca khác`, nút đáy toàn chiều rộng, skeleton, alert lỗi, nút `Làm mới` icon xoay).
- [x] `Lịch hôm nay` dạng timeline dọc read-only (chấm trạng thái + `group-last:border-b-0` + pill `Đang dạy` / `Đã điểm danh` / `Chưa điểm danh` suy từ dữ liệu thật) và `Lịch sắp tới` nhóm theo ngày (chỉ hiện `dd/MM` khi có `lesson.date` hợp lệ).
- [x] `<section>` `Cần kiểm tra` hiển thị danh sách bấm được (2 hàng trên `< sm` chống tràn 320px, 3 cột từ `sm:`), mở `StudentRiskDrawer` qua portal ở `z-40`/`z-[45]` (dưới `CommandDialog` `z-50`), focus trap sạch trên JSDOM + trình duyệt, `Escape` có guard, trả focus + fallback, xóa stale `selectedStudentId`, chỉ liệt kê lớp `active` (không `paused`/`invited`), hiển thị gói học & issue thật (có guard `due` legacy) và link thẳng tới `/students/$studentId`.
- [x] Khối `Toàn trung tâm` nằm ở cột phải dạng `<dl>` với 3 chỉ số (`Còn phải thu` ẩn fail-closed khi `!canAccessFinance`; hint chỉ hiện khi `outstanding > 0 && dueStudentsCount > 0` với nhãn `"trong đó N học viên đến hạn"`).
- [x] `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, 4 spec E2E liên quan (`dashboard-reminders.spec.ts`, `daily-attendance.spec.ts`, `class-status.spec.ts`, `debt-payment-validation-and-guard.spec.ts`) không sửa assertion và `pnpm design:compare --screens t-dashboard --side app --force` pass 100%; không tràn ngang ở `320px/375px/768px/1440px` cả Light & Dark; đủ 7 ảnh POT trong `plans/reports/` và không commit `open-design/` hay PNG lịch sử.

## Handover Note (`--advice`)

Kế hoạch này đạt chuẩn bàn giao (`advice-handover-plan.md`) cho executor model ở tầng thấp hơn: mỗi phase chia thành các task tự chứa kèm đường dẫn tệp, symbol chính xác, điều kiện đỏ/xanh TDD, lệnh `Verify` cơ học và khối `## Failure Protocol` bắt buộc dừng và hỏi `kongming` khi bất kỳ bước kiểm chứng nào thất bại.

## Validation Log

### Session 1 — 2026-11-26
**Trigger:** Chốt phạm vi giao diện (`AppShell` & dữ liệu thật không có `room`), copy/hợp đồng E2E và adjudicate 12 phát hiện Red-Team trước khi chuyển sang triển khai.
**Questions asked:** 3 (gộp Validation + Red-Team user review trong 1 lượt `ask_question`).

#### Questions & Answers
1. **[Red-Team Adjudication]** Xử lý 12 phát hiện Red-Team có bằng chứng `file:line` (2 Critical, 7 High, 3 Medium).
   - **Answer:** `(Recommended) Đồng ý áp dụng toàn bộ 12 phát hiện Red-Team vào kế hoạch`
2. **[Scope]** Phạm vi `AppShell` và dữ liệu `room` không tồn tại trong DB Teacher OS.
   - **Answer:** `(Recommended) Chỉ redesign nội dung /teacher/dashboard (giữ nguyên AppShell chung), thay "room" bằng dữ liệu thật (sĩ số · hình thức Online/Offline · topic/type)`
3. **[Contract/Copy]** Giữ copy đồng bộ toàn app & bảo toàn 4 spec E2E hay đổi nguyên văn theo HTML prototype.
   - **Answer:** `(Recommended) Giữ copy đồng bộ toàn app (formatDashboardGreeting 3 buổi #120, "> 24h", fmtVND "đ", Hero "buổi dạy") để 4 spec E2E pass không phải sửa`

#### Confirmed Decisions
- Áp dụng trọn vẹn 12 phát hiện Red-Team (đã cập nhật inline vào `plan.md`, `phase-01`, `phase-02`, `phase-03`).
- Khóa phạm vi vào nội dung `/teacher/dashboard`, không sửa `AppShell`, không sửa API/DB.
- Giữ copy đồng bộ codebase & 4 spec E2E nguyên vẹn (Hero dùng `"buổi dạy"`, Thẻ 2 giữ `"> 24h"`, `formatDashboardGreeting` 3 buổi #120, `fmtVND` `"đ"`).

### Verification Results
- **Tier:** Standard (Fact Checker + Contract Verifier — chạy song song qua 3 reviewer độc lập)
- **Claims checked:** 21
- **Verified:** 14 | **Failed (now fixed in plan):** 7 | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-dashboard-ui-components-and-route.md`, `phase-03-verification-e2e-and-visual-pot.md`
- Decision deltas checked: 12 (toàn bộ 12 phát hiện Red-Team + 2 xác nhận Validate)
- Reconciled stale references: 12 (Hero `"buổi dạy"`, RTL matcher + inline block `<p>`, bỏ `--` khỏi `pnpm design:compare`, bổ sung `plans/261026-2038-.../screenshots` vào `git checkout`, fail-closed `openTasks` & default `canAccessFinance = false`, `<section>` + 2 hàng `< sm` cho `RiskStudentsSection`, Drawer portal `z-40`/`z-[45]` + `onCloseRef`/`openId` + lọc lớp `active` + guard `due` + không dùng `offsetParent`, `group-last:border-b-0`, hint `OrgStatsSection`, `formatEndTime` guard + `visibilitychange`/midnight sync, `Avatar` `size-12`, `page.clock.setFixedTime` + `UPDATE class_assignment` + tiền tố POT rõ ràng)
- Unresolved contradictions: 0

## Red Team Review

### Session 1 — 2026-11-26
**Reviewers:** 3 parallel fresh-context `code-reviewer` subagents (`Security Adversary`, `Assumption Destroyer`, `Failure Mode Analyst`) — Standard tier (Fact Checker + Contract Verifier).
**Findings:** 12 deduplicated (12 accepted, 0 rejected)
**Severity breakdown:** 2 Critical, 7 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | Hero summary dùng `"1 ca dạy"` đụng selector toàn trang `daily-attendance.spec.ts:201` | Critical | Accept | `plan.md`, Phase 2 (Task 2.3), Phase 3 (Task 3.1) |
| 2 | Split `<span>` trong `ReminderCards` làm gãy RTL `getByText` và bỏ `→` gây trùng `"Điểm danh"`/`"Chấm bài"`/`"2"` | Critical | Accept | `plan.md`, Phase 2 (Tests Before, Task 2.1, Task 2.3) |
| 3 | Lệnh `pnpm design:compare -- --screens ...` crash exit 1 trên pnpm 10 (`cờ không hợp lệ: --`) | High | Accept | `plan.md`, Phase 3 (Task 3.2) |
| 4 | Task 3.1 bỏ sót `plans/261026-2038-tos-17-payment-validation-and-finance-guard/screenshots` trong `git checkout` | High | Accept | Phase 3 (Task 3.1) |
| 5 | Lỗ hổng RBAC fail-open ở Hero `openTasks`, default `ReminderCards` `canAccessFinance = true`, và `outstanding`/`dueStudentsCount` chưa chặn ở `dashboard.tsx` | High | Accept | `plan.md`, Phase 2 (Task 2.1, Task 2.3) |
| 6 | `RiskStudentsSection` 3 cột ngang tràn toán học tại `320px` và thiếu thẻ gốc `<section>` cho `dashboard.test.tsx:105-109` | High | Accept | `plan.md`, Phase 2 (Task 2.2) |
| 7 | `StudentRiskDrawer` `z-[60]` đè `CommandDialog` (`z-50`), thiếu guard `Escape`/`Tab`, reset focus theo tick 60s, stale `selectedStudentId`, bẫy `offsetParent` trên JSDOM và thiếu fallback focus | High | Accept | `plan.md`, Phase 2 (Task 2.2, Task 2.3) |
| 8 | `classesByStudent` lộ lớp `paused`/`invited` trong Drawer và `formatDayMonth` hỏng trên `due` legacy non-ISO / `dueAt` | High | Accept | `plan.md`, Phase 1 (Task 1.2), Phase 2 (Task 2.2, Task 2.3) |
| 9 | Spec POT Task 3.3 vỡ theo đồng hồ thật (Chủ Nhật / quanh nửa đêm), thiếu `UPDATE class_assignment`, và dẫn `"bước 5"` không rõ cho tiền tố POT | High | Accept | Phase 3 (Files, Task 3.3) |
| 10 | `last:border-b-0` trên cột nội dung trong `TodayScheduleSection` xóa sạch toàn bộ viền ngăn dòng timeline | Medium | Accept | Phase 2 (Task 2.2) |
| 11 | Lệch phạm vi dữ liệu giữa `outstanding` toàn org và `reminders.tuition.students` (7 ngày) ở `OrgStatsSection` | Medium | Accept | `plan.md`, Phase 2 (Task 2.2, Task 2.3) |
| 12 | Thiếu guard `time`/`dur` bẩn (`addMinutes` `NaN:NaN`, `resolveDashboardFocus`), thiếu sync nửa đêm VN (`visibilitychange`), và `Avatar size="lg"` là `56px` chứ không phải `size-12` (`48px`) | Medium | Accept | `plan.md`, Phase 1 (Task 1.1, 1.2), Phase 2 (Task 2.2, 2.3) |

### Whole-Plan Consistency Sweep (Red Team Session 1)
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-dashboard-ui-components-and-route.md`, `phase-03-verification-e2e-and-visual-pot.md`
- Decision deltas checked: 12
- Reconciled stale references: 12
- Unresolved contradictions: 0

<!-- slug: redesign-teacher-dashboard -->
