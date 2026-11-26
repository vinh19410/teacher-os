---
title: "Dashboard giáo viên: bỏ ô trùng, thêm label, rút bớt chữ mô tả (#947)"
description: "Dọn dẹp Dashboard giáo viên theo phản hồi review Đường D5: bỏ ô KPI trùng lịch, thống nhất phạm vi Tổng học viên, thêm thứ tự 1-2-3 & nhãn chức năng cho 3 thẻ việc cần làm hôm nay, chuyển ngôn ngữ góc nhìn giáo viên, giới hạn bảng Cần kiểm tra còn 2 loại vấn đề kèm đơn vị buổi rõ ràng và rút gọn chữ mô tả."
status: completed
priority: P1
effort: "4h"
issue: 947
branch: vinh19410/dashboard-gi-o-vi-n-b-tr-ng-th-m-label-r-t-b-t-c
tags: [enhancement, frontend, dashboard, ux]
created: 2026-11-26
---

# Plan: Dashboard giáo viên — bỏ ô trùng, thêm label, rút bớt chữ mô tả (#947)

## Overview

Cải tiến màn hình Dashboard giáo viên (`apps/web/src/routes/_auth/dashboard.tsx`, `apps/web/src/components/dashboard/reminder-cards.tsx`, `apps/web/src/lib/dashboard-from-kernel.ts`, `apps/web/src/lib/repos/dashboard-reminders.ts`) theo phản hồi buổi review sản phẩm "Đường D5" (issue [#947](https://github.com/vinh19410/teacher-os/issues/947)):

- Bỏ ô KPI trùng lặp `"Buổi học hôm nay"`, giữ `"Tổng học viên"` thống nhất phạm vi toàn org cùng `"Bài tập chưa có điểm"` và `"Còn phải thu"` (ẩn cả KPI `"Còn phải thu"` lẫn Thẻ 3 `"Học phí"` theo `canAccessFinance === true` fail-closed).
- Nâng cấp 3 thẻ lối tắt trong `"Việc cần làm hôm nay"` với số thứ tự `1`, `2`, `3`, nhãn chức năng rõ (`Điểm danh`, `Chấm bài`, `Học phí`), ngôn ngữ giáo viên (`ca dạy`), CTA ngắn gọn và loại bỏ double-padding để `--focus-ring` ôm khít viền thẻ.
- Giới hạn bảng `"Cần kiểm tra"` đúng 2 loại vấn đề (`Chưa điểm danh` và `Bài tập trễ hạn`, bỏ `Vắng`), vá lỗi ngày tương lai / ngày rỗng trên buổi dated, kiểm tra cả `submittedAt != null || attemptId != null` để chống cờ giả D1 flip-first, thống nhất toàn bộ mốc ngày trên dashboard theo múi giờ Việt Nam (`Asia/Ho_Chi_Minh`), và hiển thị rõ đơn vị cột `"Còn"` (`còn N buổi` hoặc `Chưa có gói` khi `!hasPackage`) không bị cắt trên 320px/375px/1024px.
- Rút bớt chữ mô tả thừa trên toàn dashboard; giữ `"Lịch hôm nay"` / `"Lịch sắp tới"` là tóm tắt nhanh read-only kèm liên kết `Xem tuần →`.

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - Chỉnh sửa logic tổng hợp dashboard client (`dashboard-from-kernel.ts`), query key reminders (`repos/dashboard-reminders.ts`), 2 thành phần UI (`reminder-cards.tsx`, `dashboard.tsx`), unit tests và 3 E2E specs liên quan (`dashboard-reminders.spec.ts`, `daily-attendance.spec.ts`, `debt-payment-validation-and-guard.spec.ts`).
  - Áp dụng đúng 2 quyết định sản phẩm đã chốt với user (Validation Session 1): giữ KPI `"Tổng học viên"` (phạm vi toàn org, bỏ `sub`); bảng `"Cần kiểm tra"` chỉ giữ 2 loại `"Chưa điểm danh"` và `"Bài tập trễ hạn"` (bỏ `"Vắng"`).
  - Vá các lỗi dữ liệu/UI liên quan trực tiếp: `isValidISODate(lesson.date) && lesson.date < todayIso` cho dated lessons, `submittedAt != null || attemptId != null` cho D1 flip-first, `!student.hasPackage` ở cột `"Còn"`, đồng bộ múi giờ Việt Nam trên `lessonDayFromDate` & `PageHead` `kicker`, fail-closed `canAccessFinance === true` trên cả KPI và `ReminderCards`, sửa double-padding `ReminderCard` và responsive bảng `"Cần kiểm tra"` từ 320px.
- **Explicit Non-Goals:**
  - Không thêm API server mới hay migration DB (`data.classAssignments` đã có sẵn trong kernel snapshot).
  - **Giới hạn dữ liệu bài tập quá hạn (Red-Team F5):** `"Bài tập trễ hạn"` trên Dashboard hiện phủ bài giao trực tiếp cho lớp (`snapshot.classAssignments` với `classStudyPackId IS NULL` tại `apps/server/src/routes/snapshot.ts:527`) và bảng legacy `assignments` (`status === "late"`, chỉ khi học viên không bị cô lập trong lớp `paused`); chưa gồm bài Bộ đề tự học (Study Pack #533) — tách follow-up issue riêng nếu sản phẩm cần đưa Study Pack vào snapshot/endpoint.
  - **Giới hạn trust boundary tài chính (Red-Team F11):** #947 chỉ ẩn bề mặt tài chính trên UI Dashboard theo `viewer.canAccessFinance === true`; việc redact `packages[].price` và `classes[].tuitionFee` trong `GET /api/kernel` (`apps/server/src/routes/snapshot.ts:747,770`) cho role `ta`/`class_teacher` là hạng mục bảo mật API riêng, không mở rộng vào PR UI này (ghi nhận làm follow-up).
  - Không đổi nguồn tính KPI `"Bài tập chưa có điểm"` (`data.assignments` legacy — tách issue riêng nếu cần mở rộng sang `classAssignments`).
  - Không gắn cờ bài tập đã nộp trễ (`submittedAt !== null || attemptId != null`) vào bảng `"Cần kiểm tra"` (chỉ gắn cờ bài chưa nộp đã quá hạn để tránh kẹt vĩnh viễn).
  - Không tách `"Lịch hôm nay"` / `"Lịch sắp tới"` thành tính năng hay route riêng, không thêm nút điểm danh trực tiếp trên dashboard (giữ read-only theo #278).
  - Không sửa harness `scripts/design-compare` (đang lệch basepath `/teacher/` sau commit `e933d3c2` — tách issue riêng); chụp POT bằng Playwright trên stack E2E thống nhất (`LMS_ORIGIN/teacher/dashboard`).
  - Không chạy full E2E suite ở local (theo `AGENTS.md`).

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Đồng bộ dữ liệu `atRiskRows` đúng 2 loại vấn đề (`missed-check-in`, `overdue-assignment`), chuẩn múi giờ VN + ngôn ngữ giáo viên | P1 |
| 2 | Dọn UI Dashboard & 3 thẻ `ReminderCards` (thứ tự 1-2-3, bỏ ô trùng, rút chữ mô tả, đơn vị cột "Còn", fail-closed quyền tài chính, responsive 320px+) | P1 |
| 3 | Cập nhật E2E liên quan, pass toàn bộ gate (`pnpm check`, `pnpm check-types`, unit test, E2E lẻ), dọn 10 PNG cũ và chụp 6 ảnh POT 3 viewport light/dark | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Data & Risk Logic (TDD)](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Dashboard UI & Reminder Cards (TDD)](./phase-02-dashboard-ui-and-reminder-cards.md) | Completed |
| 3 | [Phase 3: Verification, E2E & 3-Viewport Visual POT](./phase-03-verification-e2e-and-visual-pot.md) | Completed |

## Success Criteria

- [x] Không còn ô KPI `"Buổi học hôm nay"`; ô `"Tổng học viên"` rõ phạm vi toàn org, đồng nhất với `"Bài tập chưa có điểm"` và `"Còn phải thu"` (ẩn cả `"Còn phải thu"` lẫn Thẻ 3 `"Học phí"` khi `viewer.canAccessFinance !== true`).
- [x] Ba thẻ `"Việc cần làm hôm nay"` hiển thị rõ thứ tự `1`, `2`, `3`, nhãn chức năng (`Điểm danh`, `Chấm bài`, `Học phí`), góc nhìn giáo viên (`ca dạy`), focus ring `--focus-ring` ôm khít viền thẻ (không double-padding) và điều hướng đúng URL đích.
- [x] Toàn dashboard dùng thuật ngữ góc nhìn giáo viên (`buổi dạy`, `ca dạy`), thống nhất múi giờ `Asia/Ho_Chi_Minh` (`kicker`, lời chào, lịch, bảng kiểm tra), rút bớt chữ mô tả thừa.
- [x] Bảng `"Cần kiểm tra"` chỉ hiển thị 2 loại vấn đề (`Chưa điểm danh`, `Bài tập trễ hạn`), bỏ `Vắng`, không báo nhầm buổi dated tương lai hoặc `date: ""`, không cờ giả khi `attemptId != null`, và cột `"Còn"` hiển thị `còn N buổi` (hoặc `Chưa có gói` khi `!hasPackage`) không bị cắt khuất từ 320px trở lên.
- [x] `"Lịch hôm nay"` / `"Lịch sắp tới"` giữ dạng tóm tắt nhanh read-only kèm link `Xem tuần →`.
- [x] `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, 4 spec E2E liên quan (`dashboard-reminders.spec.ts`, `daily-attendance.spec.ts`, `class-status.spec.ts`, `debt-payment-validation-and-guard.spec.ts`) đều pass; kiểm UI 3 viewport (`1440×900`, `768×1024`, `375×812`) + `320×568` reflow cả light/dark theo `REVIEW.md` và có đủ 6 ảnh POT trong `plans/reports/`.

## Handover Note (`--advice`)

Kế hoạch này đạt chuẩn bàn giao (`advice-handover-plan.md`) cho executor model ở tầng thấp hơn: mọi phase đều chia nhỏ thành task tự chứa kèm tệp/symbol chính xác, tiêu chí quan sát được, lệnh `Verify` cơ học (gồm trạng thái red/green TDD) và khối `## Failure Protocol` bắt buộc dừng + hỏi `kongming` khi kiểm chứng thất bại.

## Validation Log

### Session 1 — 2026-11-26
**Trigger:** Chốt 2 quyết định sản phẩm còn mở từ issue #947 trước khi lập kế hoạch chi tiết (vibe `--advice` pre-plan intake).
**Questions asked:** 2

#### Questions & Answers

1. **[Scope]** Sau khi bỏ ô "Buổi học hôm nay", bạn muốn xử lý ô KPI "Học viên" (hiện đang đếm tổng học viên toàn org) theo hướng nào?
   - Options: `(Recommended) Giữ ô và đổi nhãn thành "Tổng học viên" (phạm vi toàn org, bỏ dòng phụ)` | `Bỏ hẳn ô "Học viên"` | `Đổi thành "Học viên có lịch hôm nay"`
   - **Answer:** `(Recommended) Giữ ô và đổi nhãn thành "Tổng học viên" (phạm vi toàn org, bỏ dòng phụ) — đồng nhất phạm vi tổng với 2 ô KPI còn lại, lưới 3 cột cân đối (2 cột với role không xem tài chính)`
   - **Rationale:** Loại bỏ nhập nhằng giữa phạm vi hôm nay và tổng số org; giữ hàng KPI cân đối cả với giáo viên lẫn role không có quyền tài chính.

2. **[Scope]** Trong bảng "Cần kiểm tra" (ghi chú #947 chưa chốt giữ/bỏ mục ngoài 2 loại đã nêu), bạn muốn hiển thị những loại vấn đề nào?
   - Options: `(Recommended) Giới hạn đúng 2 loại: "Chưa điểm danh" và "Bài tập trễ hạn" (bỏ nhãn "Vắng")` | `Giữ cả 3 loại: "Chưa điểm danh", "Bài tập trễ hạn" và "Vắng" (vắng không phép trong 14 ngày theo TOS-7)`
   - **Answer:** `(Recommended) Giới hạn đúng 2 loại: "Chưa điểm danh" và "Bài tập trễ hạn" (bỏ nhãn "Vắng") — đúng giới hạn Done means #5, biến bảng thành danh sách việc cần giáo viên xử lý/nhắc ngay`
   - **Rationale:** Tập trung bảng "Cần kiểm tra" thành hàng chờ hành động trực tiếp cho giáo viên đúng như phản hồi review Đường D5.

#### Confirmed Decisions
- **KPI "Học viên"**: Giữ ô, đổi nhãn thành `"Tổng học viên"`, bỏ dòng phụ `"X cần kiểm tra"`.
- **Bảng "Cần kiểm tra"**: Chỉ giữ 2 loại `"Chưa điểm danh"` (`missed-check-in`) và `"Bài tập trễ hạn"` (`overdue-assignment`); bỏ `"Vắng"` (`absent`).

#### Impact on Phases
- Phase 1: Bỏ `"absent"` khỏi `DashboardRiskReason`, bổ sung `"overdue-assignment"` từ `classAssignments` (+ `assignments` legacy `late`), vá `missed-check-in` cho dated lessons.
- Phase 2: Render nhãn `"Tổng học viên"`, ẩn `"Buổi học hôm nay"`, cập nhật `RISK_LABEL`, cột `"Còn"` và 3 thẻ `ReminderCards`.

## Red Team Review

### Session 1 — 2026-11-26
**Reviewers:** 3 parallel fresh-context `code-reviewer` subagents (Security Adversary, Assumption Destroyer, Failure Mode Analyst) — Standard tier (Fact Checker + Contract Verifier).
**Findings:** 11 deduplicated (11 accepted — 10 full, 1 partial scope-bounded; 0 rejected without evidence)
**Severity breakdown:** 2 Critical, 9 High, 0 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | `pnpm design:compare` hỏng theo basepath `/teacher/`, thiếu seed risk/packages/>24h, ghi ảnh vào `.state/raw/`, và Phase 3 mâu thuẫn 5 vs 6 file POT | Critical | Accept | `plan.md`, Phase 3 (Files & Task 3.3) |
| 2 | Phase 2 bỏ sót test `dashboard.test.tsx:260` và phá vỡ async wait barrier khi heading `"Việc cần làm hôm nay"` trở thành tĩnh | Critical | Accept | Phase 2 (Task 2.1) |
| 3 | `canAccessFinance` fail-open (`?? true`), `<ReminderCards>` không guard theo `canAccessFinance`, và `remindersQueryKey` không tách `viewer.role` | High | Accept | `plan.md`, Phase 2 (Task 2.1, 2.2, 2.3) |
| 4 | Lệch múi giờ VN vs giờ máy cục bộ giữa `atRiskRows`, `lessonDayFromDate`, `PageHead` `kicker` và fixture `Date` cục bộ trong tests | High | Accept | Phase 1 (Task 1.1, 1.2), Phase 2 (Task 2.1, 2.3) |
| 5 | `atRiskRows` chỉ kiểm `submittedAt === null` (cờ giả D1 flip-first `attemptId != null`), bỏ sót Study Pack (`classStudyPackId IS NOT NULL`), và legacy `assignments` lọt bộ lọc lớp tạm dừng | High | Accept | `plan.md` (Non-Goals), Phase 1 (Task 1.1, 1.2) |
| 6 | Thiếu validate `isValidISODate(lesson.date)` (lỗi `date: ""`) và viết trùng helper `isoWeekday` (đã có `isoDayNumber` trong `week-grid.ts:151`) | High | Accept | Phase 1 (Task 1.1, 1.2) |
| 7 | Cột `"Còn"` với `whitespace-nowrap` trong bảng `"Cần kiểm tra"` bị cắt ngoài khung ở 320px/375px/1024px mà check `documentElement.scrollWidth` không phát hiện | High | Accept | Phase 2 (Task 2.3), Phase 3 (Task 3.3) |
| 8 | `ReminderCard` bị double-padding (`Card` `p-6` + inner `p-5`) làm thụt focus ring 24px và `daily-attendance.spec.ts:194` lệ thuộc `xpath=..` | High | Accept | Phase 2 (Task 2.2), Phase 3 (Task 3.1) |
| 9 | Phantom test `#694` ở `dashboard.test.tsx:324` (`status: "absent"`) và assertion chết `/Sổ học phí/` ở `reminder-cards.test.tsx:73` | High | Accept | Phase 2 (Task 2.1) |
| 10 | Playwright strict-mode collision ở Task 3.1 (`getByText("1")` / `"Điểm danh"`) và chạy Task 3.2 ghi đè 10 file PNG tracked của các plan cũ | High | Accept | Phase 3 (Task 3.1, 3.2) |
| 11 | `GET /api/kernel` vẫn trả `packages[].price`/`classes[].tuitionFee` cho `ta`/`class_teacher`; thiếu E2E phân quyền Dashboard (`debt-payment-validation-and-guard.spec.ts`) | High | Accept (partial) | `plan.md` (Non-Goals trust boundary), Phase 3 (Task 3.1, 3.2) |

### Verification Results
- **Tier:** Standard (Fact Checker + Contract Verifier)
- **Claims checked:** 20 (5 exported symbols + exact caller counts across 19 E2E specs & 26 unit/integration test files + 15 codebase claims)
- **Verified:** 15 | **Failed (now fixed in plan):** 5 (`isoWeekday` vs `isoDayNumber`, `dashboard.test.tsx:260` gap, `design:compare` basepath/seed/output + 5 vs 6 PNGs, `canAccessFinance` fail-open, `Card` `p-6` double-padding) | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-dashboard-ui-and-reminder-cards.md`, `phase-03-verification-e2e-and-visual-pot.md`
- Decision deltas checked: 11 (all Red Team Session 1 accepted findings)
- Reconciled stale references: 11 (đồng bộ 6 file POT, `isoDayNumber`/`isValidISODate`, `canAccessFinance === true`, `remindersQueryKey`, `attemptId != null`, `timeZone: "Asia/Ho_Chi_Minh"`, `data-testid` cho `ReminderCard`, responsive bảng `"Cần kiểm tra"`, `debt-payment-validation-and-guard.spec.ts`, hoàn nguyên 10 PNG lịch sử)
- Unresolved contradictions: 0

<!-- slug: 947-teacher-dashboard-cleanup -->
