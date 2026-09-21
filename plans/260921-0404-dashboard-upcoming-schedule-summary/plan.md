---
title: "Tóm tắt lịch sắp tới trên dashboard"
description: "Thêm section display-only 'Lịch sắp tới' (phần còn lại của tuần hiện tại) vào /dashboard bên cạnh khối 'Lịch hôm nay'."
status: pending
priority: P2
effort: 2h
branch: vinh19410/feat/dashboard-upcoming-summary
tags: [feature, frontend]
blockedBy: []
blocks: []
created: 2026-09-21
---

# Tóm tắt lịch sắp tới trên dashboard

## Overview

Dashboard hiện chỉ hiển thị "Lịch hôm nay" rồi nhảy sang "Học viên rủi ro", giáo viên không thấy trước các buổi còn lại trong tuần. Giải pháp: thêm selector thuần `upcomingLessonsThisWeek` vào `dashboard-from-kernel.ts` (date-aware, chọn phần còn lại của tuần hiện tại — mai đến Chủ nhật) và một section display-only "Lịch sắp tới" trên `/dashboard`, đặt sau khối "Lịch hôm nay" và trước "Học viên rủi ro". Không mutation, không API/server/DB mới.

## Key Decisions

1. **Selector mới date-aware thay vì đổi `lessonsToday`**: `lessonsToday` (`apps/web/src/lib/dashboard-from-kernel.ts:12-18`) lọc theo `day` thuần, không xét `date` — đúng ngữ nghĩa "mọi thứ định kỳ rơi vào hôm nay". Buổi sắp tới cần ngữ nghĩa khác (dòng có `date` chỉ hiện trong tuần của nó), nên thêm hàm riêng `upcomingLessonsThisWeek`; không sửa `lessonsToday` (out of scope, tránh regression khối hôm nay).
2. **Phạm vi "phần còn lại của tuần hiện tại" thay vì "7 ngày tới"**: khớp model tuần Mon=1..7 của `lesson.day`, khớp ngữ cảnh link "Xem tuần →" (`/schedule`), và boundary Chủ nhật tự nhiên cho mảng rỗng mà không cần math cửa sổ 7 ngày trộn legacy + dated. Tái dùng sẵn `todayISOVietnam`, `startOfWeekMonday`, `weekDates` từ `week-grid.ts`.
3. **Display-only, không nút Điểm danh**: check-in chỉ dành cho buổi hôm nay (hành vi hiện có của khối "Lịch hôm nay"). Section mới chỉ đọc `data.lessons` qua `useData()`, không gọi `useDirectKernelAction`.
4. **Kiểu trả về flat `Lesson[]` sort theo (day, time), group theo ngày ở UI**: nhất quán với `lessonsToday` (flat, sort time), assertion test gọn (`map(id)`); grouping là presentation concern với đúng một consumer (`dashboard.tsx`).
5. **Không dedupe học viên như `distinctStudentsBySid` của /schedule**: khối "Lịch hôm nay" cũng hiển thị từng row; session 1:2 hiện 2 hàng tên 2 học viên là hành vi mong muốn của tóm tắt này.

## Verified Evidence

| Claim | Evidence |
| --- | --- |
| Dashboard render PageHead → "Lịch hôm nay" + Link `/schedule` → Card list → "Học viên rủi ro" | `apps/web/src/routes/_auth/dashboard.tsx:46-137` |
| Data đến từ `useData()` của `@/lib/data-store` (`data.lessons`, `studentById`) | `apps/web/src/routes/_auth/dashboard.tsx:35` |
| `lessonsToday` lọc `day === today && status !== "cancelled"`, sort time, không xét `date` | `apps/web/src/lib/dashboard-from-kernel.ts:12-18` |
| `lessonDayFromDate` trả Mon=1…Sun=7 | `apps/web/src/lib/dashboard-from-kernel.ts:7-10` |
| `Lesson.date` là `yyyy-mm-dd` hoặc `null` (legacy template) | `apps/web/src/lib/mock-data.ts:40-42` |
| `todayISOVietnam(now)` trả `yyyy-mm-dd` theo giờ Việt Nam | `apps/web/src/lib/week-grid.ts:29-34` |
| `startOfWeekMonday(iso)` trả thứ Hai của tuần chứa iso (UTC-anchored) | `apps/web/src/lib/week-grid.ts:66-71` |
| `weekDates(weekStartIso)` trả 7 ISO Thứ 2→CN | `apps/web/src/lib/week-grid.ts:88-93` |
| 3 quy ước ngày khác nhau — không được trộn | `apps/web/src/lib/week-grid.ts:4-10` |
| `lessonDayLabel(day)` trả nhãn rút gọn từ `dayNames` ("T2"…"CN") | `apps/web/src/lib/format-schedule.ts:53-55`, `apps/web/src/lib/mock-data.ts:210` |
| Test file có factory `student()`/`lesson()` và fixture monday/wednesday/sunday (8/2026) | `apps/web/src/lib/dashboard-from-kernel.test.ts:11-56` |
| Route nằm trong `_auth`, redirect login khi không session | `apps/web/src/routes/_auth/dashboard.tsx:24,37-39` |
| Gate repo: `pnpm check`, `pnpm check-types`, `pnpm test` | `package.json:6,10` (scripts) |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Selector `upcomingLessonsThisWeek` date-aware trong `dashboard-from-kernel.ts` kèm unit tests đầy đủ boundary | P2 |
| 2 | Section UI "Lịch sắp tới" display-only trên `/dashboard` (sau "Lịch hôm nay", trước "Học viên rủi ro") | P2 |
| 3 | Gate toàn repo pass: `pnpm check && pnpm check-types && pnpm test` | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Selector + UI tóm tắt lịch sắp tới](./phase-01-upcoming-selector-ui.md) | Pending |

Một phase là đủ: chỉ 3 file trong `apps/web`, không phụ tác nghiệp song song, không schema/server.

## Data Flow

1. `useData()` cung cấp `data.lessons` (kernel-hydrated) và `studentById` — như hiện tại, không đổi.
2. `upcomingLessonsThisWeek(data.lessons, now)` lọc: bỏ `status === "cancelled"`; dòng legacy (`date == null`) giữ khi `day > lessonDayFromDate(now)`; dòng có `date` giữ khi `date` thuộc tập các ngày còn lại của tuần hiện tại (`> todayISOVietnam(now)` và trong `weekDates(startOfWeekMonday(todayISOVietnam(now)))`).
3. Kết quả sort theo (`day` asc, `time` asc), trả flat `Lesson[]`.
4. `dashboard.tsx` group tuần tự theo `day` (các phần tử cùng ngày đã kề nhau nhờ sort) → render `SectionLabel` "Lịch sắp tới" + nhãn ngày (`lessonDayLabel`) + các row Avatar/tên/meta. Display-only, không mutation.

## File Ownership

| File | Action | Owner |
| --- | --- | --- |
| `apps/web/src/lib/dashboard-from-kernel.ts` | Modify | Phase 1 |
| `apps/web/src/lib/dashboard-from-kernel.test.ts` | Modify | Phase 1 |
| `apps/web/src/routes/_auth/dashboard.tsx` | Modify | Phase 1 |

Một phase duy nhất sở hữu cả 3 file — không có ghi chồng.

## Success Criteria

- [ ] `/dashboard` hiển thị section "Lịch sắp tới" nằm sau "Lịch hôm nay" và trước "Học viên rủi ro".
- [ ] Section chỉ chứa buổi của phần còn lại tuần hiện tại: legacy `day > hôm nay`; dòng có `date` trong khoảng mai → Chủ nhật tuần này; loại cancelled; sort (day, time).
- [ ] Section display-only: không có nút Điểm danh/Button/Link mới; không thêm link "Xem tuần" thứ hai.
- [ ] Empty state tiếng Việt hiển thị khi không còn buổi nào ("Không có buổi học nào trong phần còn lại của tuần.").
- [ ] Boundary Chủ nhật: selector trả mảng rỗng (test).
- [ ] `pnpm --filter web test` pass với các test case mới; gate `pnpm check && pnpm check-types && pnpm test` pass từ repo root.
- [ ] `lessonsToday`, `atRiskRows`, `/schedule` và các selector của nó không đổi.

## Non-Goals

- Không đổi `lessonsToday` (day-based, không xét `date`) — hành vi "Lịch hôm nay" giữ nguyên.
- Không thêm action check-in/điểm danh cho buổi tương lai.
- Không pagination, không cửa sổ "7 ngày tới", không week navigation — chỉ phần còn lại của tuần hiện tại.
- Không đổi `/schedule` hay `selectWeekColumnLessons`/`selectWeekColumnSessions`/`distinctStudentsBySid`.
- Không dedupe hay gộp session theo class như week grid — hiển thị từng row như khối hôm nay.
- Không đổi server/API/DB/schema.

## Risks / Mitigations / Rollback

| Risk | Likelihood x Impact | Mitigation |
| --- | --- | --- |
| Trộn 3 quy ước ngày (JSON 0-6, lesson 1-7, JS getDay) khi lọc cửa sổ | Medium x High | Tái dùng `lessonDayFromDate`, `todayISOVietnam`, `startOfWeekMonday`, `weekDates`; không tự viết date math; test boundary dated |
| Timezone drift làm "hôm nay"/tuần lệch trên CI hoặc máy khác múi giờ | Low x High | `todayISOVietnam` pin Asia/Ho_Chi_Minh; week math UTC-anchored; test dùng fixture `now` cố định giờ 12:00 (an toàn ±7h qua ngày) |
| Dòng có `date` nhưng `day` không khớp weekday của `date` (data invariant lệch) | Low x Low | Kernel generate `day = scheduleDay + 1` từ date; sort theo `day` vẫn ổn định; không xử lý thêm (non-goal) |
| Section dài khi tuần còn nhiều buổi | Low x Low | Tối đa 6 ngày × số buổi thực tế; display-only, không pagination theo scope đã chốt |

Rollback: revert 3 file đã liệt kê ở File Ownership; không migration, không dữ liệu, không server rollback.

## Open Questions

Không.

<!-- slug: dashboard-upcoming-schedule-summary -->
